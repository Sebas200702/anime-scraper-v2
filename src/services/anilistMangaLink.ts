import { CONFIG } from '../config/config.js'
import { SOURCE_HOSTS } from '../config/sources.js'
import { proxyKey } from '../core/rateGate.js'
import { rateGate } from '../core/genericManager.js'
import { fetcher } from '../libs/fetcher.js'
import type { ProxyTarget } from '../libs/transport.js'
import { toMangaLinks } from '../processors/anilistMangaLink.js'
import { anilistMangaLinkRepository } from '../repositories/anilistMangaLink.js'
import { taskRepository } from '../repositories/tasks.js'
import { TaskContinuation } from '../shared/taskContinuation.js'
import type { AniListMangaLinkMedia } from '../types/anilistApi.js'
import type { ScrapingTask } from '../types/index.js'
import { linkCursor, runMangaLinkPass } from './anilistMangaLinkPass.js'

/** 50 `idMal` por request; solo lo que MAL no da (L14). */
const MANGA_LINK_QUERY = `query ($ids: [Int]) {
  Page(page: 1, perPage: 50) {
    media(idMal_in: $ids, type: MANGA) { id idMal countryOfOrigin bannerImage }
  }
}`

interface MangaLinkResponse {
  data?: { Page?: { media?: AniListMangaLinkMedia[] | null } | null } | null
  errors?: { message: string }[]
}

/** Una página. Un error GraphQL (aunque traiga datos parciales) la falla entera. */
export const fetchAnilistMangaLinkPage = async (
  ids: number[],
  proxy?: ProxyTarget
): Promise<AniListMangaLinkMedia[]> => {
  const response = await fetcher<MangaLinkResponse>({
    url: CONFIG.ANILIST_BASE,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'anime-scraper/2.0',
    },
    body: JSON.stringify({ query: MANGA_LINK_QUERY, variables: { ids } }),
    agent: proxy,
    timeoutMs: 20_000,
  })
  if (response.errors?.length)
    throw new Error(
      `AniList: ${response.errors[0]?.message ?? 'unknown error'}`
    )
  return response.data?.Page?.media ?? []
}

/**
 * Cupo del gate compartido (`graphql.anilist.co` + IP de salida) para cada
 * página extra: la misma clave que usa el dispatcher para `anilist` y
 * `anilistMedia` dentro del proceso.
 */
const throttleFor = (proxy?: ProxyTarget) => async () => {
  const { host, limits } = SOURCE_HOSTS.anilist!
  await rateGate.acquire(
    proxyKey(host, typeof proxy === 'string' ? proxy : undefined),
    limits
  )
}

/**
 * Enlace AniList de manga (S6, L14): pase reanudable por tramos. Si el tramo
 * no termina, la tarea vuelve a `pending` (`TaskContinuation`); al terminar,
 * el cursor queda en 0 y el manager la completa con su refresco diario.
 */
export const fetchAnilistMangaLink = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<{ linked: number } | TaskContinuation> => {
  const { afterMalId } = (task.payload ?? {}) as { afterMalId?: unknown }
  const result = await runMangaLinkPass({
    startAfter: linkCursor(afterMalId),
    selectIds: (after, limit) =>
      anilistMangaLinkRepository.unlinkedMangaIds(after, limit),
    fetchPage: (ids) => fetchAnilistMangaLinkPage(ids, proxy),
    savePage: (ids, media) =>
      anilistMangaLinkRepository.saveMangaLinks(toMangaLinks(ids, media)),
    saveCursor: (after) =>
      taskRepository.mergeTaskPayload(task.id, { afterMalId: after }),
    throttle: throttleFor(proxy),
  })
  if (!result.done)
    return new TaskContinuation(
      `${result.pages} páginas, ${result.linked} manga enlazados; cursor ${result.cursor}`
    )
  return { linked: result.linked }
}
