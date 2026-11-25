import { CONFIG } from '../../config/config.js'
import { fetcher } from '../../libs/fetcher.js'
import { SkippedTaskError } from '../../libs/skippedTaskError.js'
import type { ProxyTarget } from '../../libs/transport.js'
import type { ScrapingTask } from '../../types/index.js'
import { mediaDeepSelection } from './selection.js'
import type { AniListMediaDeep, AniListMediaType } from './types.js'

export { mediaDeepSelection } from './selection.js'

const MEDIA_DEEP_QUERY = `query ($id: Int, $type: MediaType, $charPage: Int, $staffPage: Int) {
  Media(id: $id, type: $type) {
${mediaDeepSelection('$charPage', '$staffPage')}
  }
}`

export const ANILIST_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'User-Agent': 'anime-scraper/2.0',
}

/** Una página (reparto `charPage`, staff `staffPage`) de un medio. */
export const queryMediaDeep = async (
  anilistId: number,
  type: AniListMediaType,
  charPage: number,
  staffPage: number,
  proxy?: ProxyTarget
): Promise<AniListMediaDeep | null> => {
  const response = await fetcher<{
    data?: { Media?: AniListMediaDeep | null }
    errors?: { message: string }[]
  }>({
    url: CONFIG.ANILIST_BASE,
    method: 'POST',
    headers: ANILIST_HEADERS,
    body: JSON.stringify({
      query: MEDIA_DEEP_QUERY,
      variables: { id: anilistId, type, charPage, staffPage },
    }),
    agent: proxy,
    // La latencia real por proxy es ~0,5 s (p90 1,2 s): 12 s es un margen
    // enorme y evita que un task lento alargue todo el lote.
    timeoutMs: 8_000,
  })
  if (response.errors?.length) {
    const message = response.errors[0]?.message ?? 'unknown error'
    if (/not found/i.test(message))
      throw new SkippedTaskError('anilist:not_found')
    throw new Error(`AniList: ${message}`)
  }
  return response.data?.Media ?? null
}

type PageFn = (
  charPage: number,
  staffPage: number
) => Promise<AniListMediaDeep | null>

/** El reparto y el staff van paginados: se piden las páginas que falten. */
export const paginateMediaDeep = async (
  first: AniListMediaDeep,
  page: PageFn
): Promise<AniListMediaDeep> => {
  const characters = [...first.characters.edges]
  let charPage = 1
  while (first.characters.pageInfo.hasNextPage && charPage < 20) {
    charPage++
    const next = await page(charPage, 1)
    if (!next) break
    characters.push(...next.characters.edges)
    if (next.characters.edges.length === 0) break
  }

  const staff = [...first.staff.edges]
  let staffPage = 1
  while (first.staff.pageInfo.hasNextPage && staffPage < 20) {
    staffPage++
    const next = await page(1, staffPage)
    if (!next) break
    staff.push(...next.staff.edges)
    if (next.staff.edges.length === 0) break
  }

  return {
    ...first,
    characters: { pageInfo: first.characters.pageInfo, edges: characters },
    staff: { pageInfo: first.staff.pageInfo, edges: staff },
  }
}

/** Tipo de medio de la tarea (ANIME por defecto). */
export const mediaTypeOf = (task: ScrapingTask): AniListMediaType =>
  (task.payload as { mediaType?: string } | null)?.mediaType === 'MANGA'
    ? 'MANGA'
    : 'ANIME'

/**
 * Pase profundo de un medio. `throttle` corre antes de **cada** request: el
 * camino de una tarea no la usa (el dispatcher ya pagó su cupo).
 */
export const fetchMediaDeep = async (
  task: ScrapingTask,
  proxy?: ProxyTarget,
  throttle?: () => Promise<unknown>
): Promise<{ mediaType: AniListMediaType; media: AniListMediaDeep }> => {
  const { anilistId } = task.payload as { anilistId?: number }
  if (!anilistId) throw new SkippedTaskError('missing:anilistId')

  const type = mediaTypeOf(task)
  const page: PageFn = async (charPage, staffPage) => {
    await throttle?.()
    return queryMediaDeep(anilistId, type, charPage, staffPage, proxy)
  }

  const first = await page(1, 1)
  if (!first) throw new SkippedTaskError('anilist:not_found')
  return { mediaType: type, media: await paginateMediaDeep(first, page) }
}
