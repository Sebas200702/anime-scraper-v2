/**
 * Saca el id de TVDB de los mappings de Kitsu (`/anime/{id}/mappings`).
 * Los `externalSite` de TVDB son `thetvdb/series` o `thetvdb/movie`.
 */
export interface KitsuMappingsResponse {
  data?: {
    attributes?: { externalSite?: string; externalId?: string }
  }[]
}

export function pickTvdbId(
  mappings: KitsuMappingsResponse | null | undefined
): number | null {
  for (const m of mappings?.data ?? []) {
    const site = m.attributes?.externalSite ?? ''
    if (!site.includes('thetvdb')) continue
    const id = Number(m.attributes?.externalId)
    if (Number.isInteger(id) && id > 0) return id
  }
  return null
}
