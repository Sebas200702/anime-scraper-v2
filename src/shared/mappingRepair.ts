/**
 * Regla de reparación de cross-ids (`kitsu_id` / `tvdb_id` / `anilist_id`).
 *
 * El mapping por título guardaba el primer resultado de la búsqueda sin
 * verificarlo; 8.085 animes quedaron con un `kitsu_id` ajeno y, con él,
 * episodios y miniaturas de otra serie. La reparación usa, en orden:
 *
 *   1. el cruce inverso de Kitsu (exacto por MAL id) — `exact`,
 *   2. el dump `anime-offline-database` (curado, sin conflicto de MAL ids),
 *   3. `null`: mejor sin id que con uno ajeno.
 *
 * Reglas derivadas:
 * - El `kitsu_id` **siempre** se recalcula (nunca se conserva un adivinado).
 * - El `tvdb_id` se derivó del `kitsu_id`: si el anime tiene cruce exacto se
 *   toma el suyo; si no lo tiene pero el `kitsu_id` ya era el correcto, se
 *   conserva el anterior (y se marca confiable); en cualquier otro caso se
 *   descarta junto con su media.
 * - El `anilist_id` solo se **rellena** si falta: los existentes vienen de
 *   AniList (`idMal`), que es exacto.
 */
export interface CurrentIds {
  animeId: number
  kitsuId: number | null
  tvdbId: number | null
  anilistId: number | null
}

export interface ExactIds {
  kitsuId: number
  anilistId: number | null
  tvdbId: number | null
}

export interface MappingDecision {
  kitsuId: number | null
  tvdbId: number | null
  anilistId: number | null
  /** `false` → el `tvdb_id` anterior se descarta y su media también. */
  tvdbTrusted: boolean
  sawExactCrossmap: boolean
}

export const decideMapping = (
  current: Pick<CurrentIds, 'kitsuId' | 'tvdbId' | 'anilistId'>,
  exact: ExactIds | undefined,
  dumpKitsu: number | null
): MappingDecision => {
  const kitsuId = exact?.kitsuId ?? dumpKitsu ?? null

  let tvdbId: number | null
  let tvdbTrusted: boolean
  if (exact) {
    // Cruzado por Kitsu: su mapping de TVDB es el autoritativo.
    tvdbId = exact.tvdbId
    tvdbTrusted = true
  } else if (current.kitsuId !== null && current.kitsuId === kitsuId) {
    // Sin cruce, pero el kitsu ya era el correcto: lo derivado sigue siendo válido.
    tvdbId = current.tvdbId
    tvdbTrusted = true
  } else {
    tvdbId = null
    tvdbTrusted = false
  }

  return {
    kitsuId,
    tvdbId,
    anilistId: current.anilistId ?? exact?.anilistId ?? null,
    tvdbTrusted,
    sawExactCrossmap: exact !== undefined,
  }
}
