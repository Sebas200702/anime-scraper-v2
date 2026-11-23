import type { AniListMangaLinkMedia, MangaLink } from '../types/anilistApi.js'

/**
 * Media de AniList → enlaces de manga (S6, L14). Solo los `idMal` pedidos
 * (AniList podría devolver otros), uno por `mal_id` y uno por `anilist_id`
 * (el primero gana): un mismo id de AniList nunca se reparte entre dos manga.
 * Sin mapeo de vocabulario: país y banner van tal cual.
 */
export const toMangaLinks = (
  ids: readonly number[],
  media: readonly AniListMangaLinkMedia[]
): MangaLink[] => {
  const requested = new Set(ids)
  const seenMal = new Set<number>()
  const seenAnilist = new Set<number>()
  const links: MangaLink[] = []
  for (const item of media) {
    const malId = item?.idMal
    if (!malId || !requested.has(malId) || !item.id) continue
    if (seenMal.has(malId) || seenAnilist.has(item.id)) continue
    seenMal.add(malId)
    seenAnilist.add(item.id)
    links.push({
      malId,
      anilistId: item.id,
      country: item.countryOfOrigin || null,
      banner: item.bannerImage || null,
    })
  }
  return links
}

/**
 * El servicio ya escribió cada página y su cursor: al terminar la pasada no
 * queda nada que guardar y el manager completa la tarea con su política.
 */
export const processAnilistMangaLink = (): undefined => undefined
