import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { character } from '../schemas/character.js'
import { staff } from '../schemas/staff.js'
import { animeCharacter } from '../schemas/animeRelations.js'
import { characterVoiceActor } from '../schemas/characterRelations.js'
import { characterMedia, staffMedia } from '../schemas/media.js'
import { batchUpsert } from '../shared/batchUpsert.js'
import { chunk } from '../utils/chunk.js'
import { unique } from '../utils/deduplicate.js'
import type { MalCharactersProcessorResult } from '../processors/malCharacters.js'

/**
 * Guarda el reparto completo de un anime con los datos de la página de
 * personajes de MAL.
 *
 * Orden por FK: primero los personajes y las personas (voces), después los
 * vínculos y la media. Todo idempotente: la identidad natural de cada junction
 * es su clave primaria compuesta.
 */
/** MAL usa un GIF de interrogante para los personajes sin ficha: no es un retrato. */
const isRealImage = (src: string | null | undefined): src is string =>
  Boolean(src) && !/questionmark/i.test(src as string)

export const malCharactersRepository = {
  async saveMalCharacters(
    results: MalCharactersProcessorResult[]
  ): Promise<number> {
    const characters = unique(
      results.flatMap((r) => r.characters),
      (c) => `${c.characterId}`
    )
    const voiceActors = unique(
      results.flatMap((r) => r.voiceActors),
      (v) => `${v.characterId}:${v.staffId}:${v.language}`
    )
    if (characters.length === 0 && voiceActors.length === 0) return 0

    // 1) Los personajes (id de MAL del personaje, con su nombre y nativo).
    for (const batch of chunk(characters, 1_000)) {
      await db.execute(sql`
        INSERT INTO character (mal_id, name, name_kanji)
        SELECT v.id, v.name, v.native_name
        FROM (VALUES ${sql.join(
          batch.map(
            (c) =>
              sql`(${c.characterId}::int, ${c.name}::text, ${c.nativeName}::text)`
          ),
          sql`, `
        )}) AS v(id, name, native_name)
        ON CONFLICT (mal_id) DO UPDATE SET
          name = COALESCE(NULLIF(EXCLUDED.name, ''), character.name),
          name_kanji = COALESCE(EXCLUDED.name_kanji, character.name_kanji)
      `)
    }

    // 2) Las voces son personas: se crean (o completan) como staff para que
    //    la página de seiyuu exista aunque no vinieran de la ficha del anime.
    const vaStaff = unique(voiceActors, (v) => `${v.staffId}`)
    for (const batch of chunk(vaStaff, 1_000)) {
      await db.execute(sql`
        INSERT INTO staff (mal_id, name)
        SELECT v.id, v.name
        FROM (VALUES ${sql.join(
          batch.map((v) => sql`(${v.staffId}::int, ${v.name}::text)`),
          sql`, `
        )}) AS v(id, name)
        ON CONFLICT (mal_id) DO UPDATE SET
          name = COALESCE(NULLIF(EXCLUDED.name, ''), staff.name)
      `)
    }

    // 3) El vínculo anime ↔ personaje con su rol.
    const links = unique(
      results.flatMap((r) =>
        r.characters.map((c) => ({
          animeId: c.animeId,
          characterId: c.characterId,
          role: c.role,
        }))
      ),
      (c) => `${c.animeId}:${c.characterId}:${c.role}`
    )
    await batchUpsert(animeCharacter, links, 3, 'anime-character')

    // 4) Las voces con su idioma.
    await batchUpsert(
      characterVoiceActor,
      voiceActors.map((v) => ({
        characterId: v.characterId,
        staffId: v.staffId,
        language: v.language,
      })),
      3,
      'character-voice-actor'
    )

    // 5) Los retratos (del personaje y de su voz).
    const characterPortraits = unique(
      characters
        .filter((c) => c.image)
        .map((c) => ({ id: c.characterId, src: c.image as string })),
      (c) => `${c.id}:${c.src}`
    )
    for (const batch of chunk(characterPortraits, 500)) {
      await db.execute(sql`
        INSERT INTO character_media (character_id, media_type, src, size, source, priority)
        SELECT v.id, 'poster', v.src, NULL, 'mal', 20
        FROM (VALUES ${sql.join(
          batch.map((c) => sql`(${c.id}::int, ${c.src}::text)`),
          sql`, `
        )}) AS v(id, src)
        ON CONFLICT (character_id, media_type, src) DO NOTHING
      `)
    }

    const staffPortraits = unique(
      voiceActors
        .filter((v) => isRealImage(v.image))
        .map((v) => ({ id: v.staffId, src: v.image as string })),
      (v) => `${v.id}:${v.src}`
    )
    for (const batch of chunk(staffPortraits, 500)) {
      await db.execute(sql`
        INSERT INTO staff_media (staff_id, media_type, src, size, source, priority)
        SELECT v.id, 'poster', v.src, NULL, 'mal', 20
        FROM (VALUES ${sql.join(
          batch.map((v) => sql`(${v.id}::int, ${v.src}::text)`),
          sql`, `
        )}) AS v(id, src)
        ON CONFLICT (staff_id, media_type, src) DO NOTHING
      `)
    }

    return links.length
  },
}
