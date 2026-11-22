import { animeCharacter } from '../../schemas/animeRelations.js'
import { mangaCharacter } from '../../schemas/mangaRelations.js'
import { characterVoiceActor } from '../../schemas/characterRelations.js'
import { batchUpsert } from '../../shared/batchUpsert.js'
import { unique } from '../../utils/deduplicate.js'
import {
  ANILIST_ONLY_ID_BASE,
  matchCastCharacter,
  planCharacterExternal,
} from '../../utils/anilistCast.js'
import type { AniListMediaProcessorResult } from '../../processors/anilistMedia.js'
import {
  insertCharacterPosters,
  loadCasts,
  upsertCharacterExternal,
} from './castSql.js'
import {
  fillCharacterAttributes,
  insertAnilistOnlyCharacters,
  type CharacterAttributes,
} from './characters.js'
import { findStaffId } from './staffIndex.js'

type Result = AniListMediaProcessorResult & { mediaId: number }

/**
 * Reparto de AniList de un tipo de medio. Cada personaje se empareja solo con
 * el reparto ya guardado de **ese** medio (nunca una búsqueda global); sin
 * pareja única queda como personaje solo-AniList (1e9 + id de AniList).
 */
export const saveCast = async (
  mediaType: 'ANIME' | 'MANGA',
  results: Result[],
  staffIndex: Map<string, number>
): Promise<void> => {
  if (results.length === 0) return
  const casts = await loadCasts(
    mediaType,
    results.map((r) => r.mediaId)
  )

  const links: { mediaId: number; characterId: number; role: string }[] = []
  const matched: CharacterAttributes[] = []
  const anilistOnly: CharacterAttributes[] = []
  const external: { characterId: number; anilistId: number }[] = []
  const posters: { characterId: number; src: string }[] = []
  const voices: { characterId: number; staffId: number; language: string }[] =
    []

  for (const r of results) {
    const cast = casts.get(r.mediaId) ?? []
    for (const c of r.characters) {
      const hit = matchCastCharacter(c, cast)
      const characterId = hit ?? ANILIST_ONLY_ID_BASE + c.anilistId
      const attrs = { ...c, characterId }
      if (hit === null) anilistOnly.push(attrs)
      else matched.push(attrs)
      external.push({ characterId, anilistId: c.anilistId })
      if (c.image) posters.push({ characterId, src: c.image })
      links.push({ mediaId: r.mediaId, characterId, role: c.role })
      for (const va of c.voiceActors) {
        // Voces: cruce global por nombre de staff (sin cambios, fuera de S1).
        const staffId = findStaffId(staffIndex, va.name)
        if (staffId) voices.push({ characterId, staffId, language: 'Japanese' })
      }
    }
  }

  await insertAnilistOnlyCharacters(anilistOnly)
  await fillCharacterAttributes([...matched, ...anilistOnly])
  await upsertCharacterExternal(planCharacterExternal(external))
  await insertCharacterPosters(unique(posters, (p) => `${p.characterId}`))

  const key = (l: (typeof links)[number]) =>
    `${l.mediaId}:${l.characterId}:${l.role}`
  if (mediaType === 'ANIME') {
    await batchUpsert(
      animeCharacter,
      unique(links, key).map((l) => ({
        animeId: l.mediaId,
        characterId: l.characterId,
        role: l.role,
      })),
      3,
      'anime-character'
    )
  } else {
    await batchUpsert(
      mangaCharacter,
      unique(links, key).map((l) => ({
        mangaId: l.mediaId,
        characterId: l.characterId,
        role: l.role,
      })),
      3,
      'manga-character'
    )
  }

  await batchUpsert(
    characterVoiceActor,
    unique(voices, (v) => `${v.characterId}:${v.staffId}:${v.language}`),
    3,
    'character-voice-actor'
  )
}
