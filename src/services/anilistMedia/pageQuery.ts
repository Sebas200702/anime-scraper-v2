import { CONFIG } from '../../config/config.js'
import { fetcher } from '../../libs/fetcher.js'
import { SkippedTaskError } from '../../libs/skippedTaskError.js'
import type { ProxyTarget } from '../../libs/transport.js'
import { ANILIST_HEADERS, mediaDeepSelection } from './deepQuery.js'
import type { AniListMediaDeep, AniListMediaType } from './types.js'

/** Query `Page { media(id_in:) }` del lote de T11 (L21) y su lectura. */
interface PageResponse {
  data?: { Page?: { media?: (AniListMediaDeep | null)[] | null } | null } | null
  errors?: { message?: string; path?: (string | number)[] }[]
}

/** Tope medido de las conexiones anidadas dentro de `Page`. */
export const PAGE_NESTED_CAP = 25

export const buildMediaBatchQuery = (count: number) =>
  `query ($ids: [Int], $type: MediaType) {
  Page(perPage: ${count}) {
    media(id_in: $ids, type: $type) {
${mediaDeepSelection('1', '1')}
    }
  }
}`

export const mediaError = (message: string) =>
  /not found/i.test(message)
    ? new SkippedTaskError('anilist:not_found')
    : new Error(`AniList: ${message}`)

/** La página del lote puede estar incompleta: tope de 25 o `hasNextPage`. */
export const truncated = (media: AniListMediaDeep) =>
  [media.characters, media.staff].some(
    (c) => c.pageInfo.hasNextPage || c.edges.length >= PAGE_NESTED_CAP
  )

/** Un request `Page` para un tipo de medio: medio (o Error) por anilistId. */
export const requestPage = async (
  ids: number[],
  type: AniListMediaType,
  proxy?: ProxyTarget
) => {
  const response = await fetcher<PageResponse>({
    url: CONFIG.ANILIST_BASE,
    method: 'POST',
    headers: ANILIST_HEADERS,
    body: JSON.stringify({
      query: buildMediaBatchQuery(ids.length),
      variables: { ids, type },
    }),
    agent: proxy,
    // ~N veces el body de un medio: más margen que los 8 s de un medio.
    timeoutMs: 20_000,
  })
  const list = response.data?.Page?.media
  if (!list)
    throw new Error(
      `AniList: ${response.errors?.[0]?.message ?? 'Page without media'}`
    )
  const found = new Map<number, AniListMediaDeep | Error>()
  for (const media of list) if (media) found.set(media.id, media)
  for (const error of response.errors ?? []) {
    const message = error.message ?? 'unknown error'
    const [root, field, index] = error.path ?? []
    const hit =
      root === 'Page' && field === 'media' && typeof index === 'number'
        ? list[index]
        : undefined
    if (!hit) throw new Error(`AniList: ${message}`)
    found.set(hit.id, mediaError(message))
  }
  return found
}
