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
/** Campos del Media que comparten la query por-anime y la de catálogo. */
const MEDIA_FIELDS = `
    id
    idMal
    bannerImage
    coverImage { extraLarge large color }
    trailer { id site }
    source
    description
    startDate { year month day }
    endDate { year month day }
    nextAiringEpisode { airingAt episode }
    relations { edges { relationType node { id type idMal } } }
    title { romaji }`

const BANNER_QUERY = `query ($idMal: Int) {
  Media(idMal: $idMal, type: ANIME) {${MEDIA_FIELDS}
  }
}`

/** Página de catálogo por año: 50 anime por request (vs 1 por tarea). */
const CATALOG_QUERY = `query ($year: Int, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    media(type: ANIME, seasonYear: $year, sort: ID) {${MEDIA_FIELDS}
    }
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

/** Tipo del Media que devuelven ambas queries. */
export type AniListMedia = NonNullable<
  NonNullable<AniListBannerResponse['data']>['Media']
>

/**
 * Trae **todo** el catálogo de AniList de un año paginando internamente
 * (50 anime por request). Evita el cap de profundidad de AniList (5000 entradas)
 * porque cada año está muy por debajo; el límite por IP se respeta vía el
 * `RateGate`. Es la vía de backfill: ~500 requests en vez de 30.000.
 */
export const fetchAniListCatalog = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<{ media: AniListMedia[] }> => {
  const { year } = task.payload as { year?: number }
  if (!year) throw new SkippedTaskError('missing:year')

  const media: AniListMedia[] = []
  let page = 1
  for (;;) {
    const response = await fetcher<AniListCatalogResponse>({
      url: CONFIG.ANILIST_BASE,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'anime-scraper/2.0',
      },
      body: JSON.stringify({
        query: CATALOG_QUERY,
        variables: { year, page },
      }),
      agent: proxy,
      timeoutMs: 20_000,
    })

    if (response.errors?.length) {
      throw new Error(
        `AniList: ${response.errors[0]?.message ?? 'unknown error'}`
      )
    }

    const batch = response.data?.Page?.media ?? []
    media.push(...batch)

    const hasNext = response.data?.Page?.pageInfo?.hasNextPage
    if (!hasNext || batch.length === 0) break
    page++
  }

  return { media }
}

interface AniListCatalogResponse {
  data?: {
    Page?: {
      pageInfo?: { hasNextPage?: boolean }
      media?: AniListMedia[]
    } | null
  }
  errors?: { message: string }[]
}
