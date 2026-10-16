/**
 * Saca el id de TVDB de los mappings de Kitsu (`/anime/{id}/mappings`).
 * Los `externalSite` de TVDB son `thetvdb/series` o `thetvdb/movie`.
 */
export interface KitsuMappingsResponse {
  data?: {
    attributes?: { externalSite?: string; externalId?: string }
  }[]
}

/**
 * Saca el id de serie de TVDB de los mappings de Kitsu. Ojo con el formato:
 * los `thetvdb` traen **dos formas** (`thetvdb = "305074/1"` películas y
 * episodios, y `thetvdb/series = "305074"`); antes se tomaba `Number("305074/1")`
 * = NaN y el mapping se perdía en silencio.
 */
export function pickTvdbId(
  mappings: KitsuMappingsResponse | null | undefined
): number | null {
  for (const m of mappings?.data ?? []) {
    const site = m.attributes?.externalSite ?? ''
    if (!site.includes('thetvdb')) continue
    // `305074/1` (movie/episode) → la serie es 305074.
    const raw = (m.attributes?.externalId ?? '').split('/')[0]
    const id = Number(raw)
    if (Number.isInteger(id) && id > 0) return id
  }
  return null
}
