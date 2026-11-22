import { characterNameKeys, normalizeCharacterName } from './characterName.js'

/**
 * Decisiones puras del pase profundo de AniList (sin DB): emparejar un
 * personaje con el reparto **del mismo medio**, roles y relaciones en el
 * vocabulario MAL, filtro de retratos y guarda de idMal.
 */

/**
 * Rango reservado para personajes que solo existen en AniList: los ids de MAL
 * no pasan de ~306.000, así que 1e9 + id de AniList no colisiona.
 */
export const ANILIST_ONLY_ID_BASE = 1_000_000_000

/** Fila del reparto ya guardado de un medio (character + character_external). */
export interface CastMember {
  characterId: number
  name: string | null
  anilistId: number | null
}

export interface CastCandidate {
  anilistId: number
  name: string | null
  alternativeNames?: readonly (string | null)[]
}

const single = (ids: number[]): number | null => {
  const distinct = [...new Set(ids)]
  return distinct.length === 1 ? (distinct[0] as number) : null
}

/**
 * Id interno del personaje del reparto que corresponde a `candidate`, o null.
 * Primero por `character_external.anilist_id`; después por nombre normalizado
 * (completo + alternativos). Exige exactamente un candidato.
 */
export function matchCastCharacter(
  candidate: CastCandidate,
  cast: readonly CastMember[]
): number | null {
  const byId = single(
    cast
      .filter((m) => m.anilistId === candidate.anilistId)
      .map((m) => m.characterId)
  )
  if (byId !== null) return byId

  const keys = new Set(
    characterNameKeys(candidate.name, candidate.alternativeNames ?? [])
  )
  if (keys.size === 0) return null
  return single(
    cast
      .filter((m) => m.anilistId === null)
      .filter((m) => {
        const key = normalizeCharacterName(m.name)
        return key !== null && keys.has(key)
      })
      .map((m) => m.characterId)
  )
}

/**
 * Emparejamiento uno a uno de todo el reparto de AniList de un medio:
 * `anilistId` → id interno o null. Un match por anilist_id siempre gana; un
 * personaje existente que dos personajes de AniList distintos toman por nombre
 * no lo toma ninguno (p. ej. dos "Guard"). No depende del orden de entrada.
 */
export function matchCastCharacters(
  candidates: readonly CastCandidate[],
  cast: readonly CastMember[]
): Map<number, number | null> {
  const byAnilistId = new Map<number, CastCandidate>()
  for (const c of candidates) {
    if (!byAnilistId.has(c.anilistId)) byAnilistId.set(c.anilistId, c)
  }

  const result = new Map<number, number | null>()
  const takenById = new Set<number>()
  for (const c of byAnilistId.values()) {
    const hit = single(
      cast.filter((m) => m.anilistId === c.anilistId).map((m) => m.characterId)
    )
    result.set(c.anilistId, hit)
    if (hit !== null) takenById.add(hit)
  }

  const free = cast.filter(
    (m) => m.anilistId === null && !takenById.has(m.characterId)
  )
  const byName = new Map<number, number>()
  const claims = new Map<number, number>()
  for (const c of byAnilistId.values()) {
    if (result.get(c.anilistId) !== null) continue
    const hit = matchCastCharacter(c, free)
    if (hit === null) continue
    byName.set(c.anilistId, hit)
    claims.set(hit, (claims.get(hit) ?? 0) + 1)
  }
  for (const [anilistId, hit] of byName) {
    if (claims.get(hit) === 1) result.set(anilistId, hit)
  }
  return result
}

/**
 * Filas de `character_external` a escribir: una por personaje y cada
 * anilist_id una sola vez por lote (el índice parcial es único; un repetido va
 * con anilist_id null para no romper la sentencia).
 */
export function planCharacterExternal(
  rows: readonly { characterId: number; anilistId: number }[]
): { characterId: number; anilistId: number | null }[] {
  const seenCharacters = new Set<number>()
  const seenAnilist = new Set<number>()
  const out: { characterId: number; anilistId: number | null }[] = []
  for (const row of rows) {
    if (seenCharacters.has(row.characterId)) continue
    seenCharacters.add(row.characterId)
    const free = !seenAnilist.has(row.anilistId)
    seenAnilist.add(row.anilistId)
    out.push({
      characterId: row.characterId,
      anilistId: free ? row.anilistId : null,
    })
  }
  return out
}

const titleCase = (value: string): string => {
  const words = value.trim().replaceAll('_', ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const ROLES: Record<string, string> = {
  MAIN: 'Main',
  SUPPORTING: 'Supporting',
  BACKGROUND: 'Background',
}

/** Rol de AniList → forma MAL (Main / Supporting / Background). */
export function mapCastRole(role: string | null | undefined): string {
  const value = (role ?? '').trim()
  if (!value) return 'Supporting'
  return ROLES[value.toUpperCase()] ?? titleCase(value)
}

/** Igual que `processors/anilist.ts` (strings de Jikan/MAL guardados). */
const RELATIONS: Record<string, string> = {
  SEQUEL: 'Sequel',
  PREQUEL: 'Prequel',
  PARENT: 'Parent story',
  SIDE_STORY: 'Side story',
  CHARACTER: 'Character',
  SUMMARY: 'Summary',
  ALTERNATIVE: 'Alternative setting',
  SPIN_OFF: 'Spin-off',
  ADAPTATION: 'Adaptation',
  COMPILATION: 'Summary',
  CONTAINS: 'Other',
  OTHER: 'Other',
  SOURCE: 'Other',
}

export function mapRelationType(
  type: string | null | undefined,
  mediaType: 'ANIME' | 'MANGA' = 'ANIME'
): string {
  const label = RELATIONS[(type ?? '').toUpperCase()] ?? 'Other'
  // manga_relation guarda el vocabulario de MAL manga: "Side story" → "SIDE_STORY".
  return mediaType === 'MANGA'
    ? label.toUpperCase().replace(/[\s-]+/g, '_')
    : label
}

/** Retrato real (no el placeholder `/default.jpg|png` de AniList). */
export function isRealAnilistImage(
  src: string | null | undefined
): src is string {
  if (!src) return false
  return !/\/default\.(jpg|png)(\?.*)?$/i.test(src)
}

/**
 * Medio al que se adjunta el pase: el de la tarea. Si AniList dice otro idMal,
 * se salta (mediaId null) para no colgar un reparto en el medio equivocado.
 */
export function resolveCastMediaId(
  taskMediaId: number | null | undefined,
  anilistIdMal: number | null | undefined
):
  | { mediaId: number | null }
  | { mediaId: null; mismatch: { taskMediaId: number; anilistIdMal: number } } {
  if (!taskMediaId) return { mediaId: anilistIdMal ?? null }
  if (anilistIdMal && anilistIdMal !== taskMediaId) {
    return { mediaId: null, mismatch: { taskMediaId, anilistIdMal } }
  }
  return { mediaId: taskMediaId }
}
