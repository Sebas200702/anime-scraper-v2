import { CONFIG } from '../config/config.js'
import { fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { AniListBannerResponse } from 'types/anilistApi.js'
import type { ScrapingTask } from 'types/index.js'
import type { ProxyTarget } from '../libs/transport.js'

/**
 * AniList (GraphQL): fuente de banners (primaria) + datos que Jikan no puede
 * dar mientras esté caído (tráiler, origen, fechas de emisión, poster).
 *
 * `idMal` cruza directo con nuestro `mal_id`, así que no hace falta búsqueda
 * por título. Todo sale en **1 request por anime** (sin task type nuevo).
 *
 * Cuota real: 30 req/min por IP (cabecera `x-ratelimit-limit`), así que el
 * `RateGate` la aplica por (host, IP) y los proxies multiplican la cuota.
 */
const BANNER_QUERY = `query ($idMal: Int) {
  Media(idMal: $idMal, type: ANIME) {
    id
    idMal
    bannerImage
    coverImage { extraLarge large color }
    trailer { id site }
    source
    startDate { year month day }
    endDate { year month day }
    title { romaji }
  }
}`

export const fetchAnimeBanners = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
) => {
  const { animeId } = task.payload as { animeId?: number }
  if (!animeId) throw new SkippedTaskError('missing:animeId')

  const response = await fetcher<AniListBannerResponse>({
    url: CONFIG.ANILIST_BASE,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'anime-scraper/2.0',
    },
    body: JSON.stringify({
      query: BANNER_QUERY,
      variables: { idMal: animeId },
    }),
    agent: proxy,
  })

  // GraphQL devuelve 200 con `errors` para fallos de consulta.
  if (response.errors?.length) {
    throw new Error(
      `AniList: ${response.errors[0]?.message ?? 'unknown error'}`
    )
  }

  return response
}
