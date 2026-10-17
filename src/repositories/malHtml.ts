import { db } from '../libs/db.js'
import { character } from '../schemas/character.js'
import { staff } from '../schemas/staff.js'
import { animeCharacter, animeStaff } from '../schemas/animeRelations.js'
import { characterVoiceActor } from '../schemas/characterRelations.js'
import { characterMedia, staffMedia } from '../schemas/media.js'
import { batchUpsert } from '../shared/batchUpsert.js'
import { unique } from '../utils/deduplicate.js'
import type { MalCharactersProcessorResult } from '../types/index.js'

/**
 * Guarda personajes, staff y seiyuus con ids MAL.
 *
 * Orden obligatorio por FK: primero los padres (`character`, `staff` —incluidos
 * los seiyuus—), luego las junctions y al final la media. Todo idempotente.
 */
export const malHtmlRepository = {
  async saveMalCharacters(
    results: MalCharactersProcessorResult[]
  ): Promise<number> {
    const characters = results.flatMap((r) => r.characters)
    const staffRows = [...results.flatMap((r) => r.staff)]
    const voiceActorStaff = results.flatMap((r) => r.voiceActorStaff)
    const animeCharacters = results.flatMap((r) => r.animeCharacters)
    const animeStaffRows = results.flatMap((r) => r.animeStaff)
    const voiceActors = results.flatMap((r) => r.characterVoiceActors)
    const charMedia = results.flatMap((r) => r.characterMedia)
    const staffMediaRows = results.flatMap((r) => r.staffMedia)

    // 1) Padres (los seiyuus también existen como staff).
    await batchUpsert(
      character,
      unique(characters, (c) => c.malId),
      2,
      'character'
    )
    await batchUpsert(
      staff,
      unique([...staffRows, ...voiceActorStaff], (s) => s.malId),
      2,
      'staff'
    )

    // 2) Junctions.
    const uAnimeCharacters = unique(
      animeCharacters,
      (c) => `${c.animeId}:${c.characterId}:${c.role}`
    )
    const uAnimeStaff = unique(
      animeStaffRows,
      (s) => `${s.animeId}:${s.staffId}:${s.role}`
    )
    const uVas = unique(
      voiceActors,
      (v) => `${v.characterId}:${v.staffId}:${v.language}`
    )
    await batchUpsert(animeCharacter, uAnimeCharacters, 3, 'anime-character')
    await batchUpsert(animeStaff, uAnimeStaff, 3, 'anime-staff')
    await batchUpsert(characterVoiceActor, uVas, 3, 'character-voice-actor')

    // 3) Media (retratos): misma identidad natural que el resto.
    const uCharMedia = unique(charMedia, (m) => `${m.entityId}:${m.src}`).map(
      (m) => ({
        characterId: m.entityId,
        mediaType: m.mediaType,
        src: m.src,
        size: null,
        source: 'mal',
        priority: 25,
      })
    )
    const uStaffMedia = unique(
      staffMediaRows,
      (m) => `${m.entityId}:${m.src}`
    ).map((m) => ({
      staffId: m.entityId,
      mediaType: m.mediaType,
      src: m.src,
      size: null,
      source: 'mal',
      priority: 25,
    }))
    if (uCharMedia.length > 0) {
      await db.insert(characterMedia).values(uCharMedia).onConflictDoNothing()
    }
    if (uStaffMedia.length > 0) {
      await db.insert(staffMedia).values(uStaffMedia).onConflictDoNothing()
    }

    return (
      characters.length +
      uAnimeCharacters.length +
      uAnimeStaff.length +
      uVas.length +
      uCharMedia.length +
      uStaffMedia.length
    )
  },
}
