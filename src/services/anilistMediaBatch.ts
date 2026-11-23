import { CONFIG } from '../config/config.js'
import { SOURCE_HOSTS } from '../config/sources.js'
import { rateGate } from '../core/genericManager.js'
import { proxyKey } from '../core/rateGate.js'
import { FetchError, fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ProxyTarget } from '../libs/transport.js'
import type { ScrapingTask } from '../types/index.js'
import {
  ANILIST_HEADERS,
  fetchMediaDeep,
  mediaDeepSelection,
  mediaTypeOf,
  paginateMediaDeep,
  queryMediaDeep,
} from './anilistMedia/deepQuery.js'
import type {
  AniListMediaDeep,
  AniListMediaType,
} from './anilistMedia/types.js'

/**
 * T11 (S6, L19): N medios por request de AniList. Un alias por tarea
 * (`m0: Media(id: $i0, type: $t0)`) con la misma selección que el camino de un
 * medio y la página 1 de reparto y staff (50, igual que ese camino: así las
 * páginas siguientes se piden con su mismo helper sin desalinearse).
 *
 * - Error GraphQL con `path[0]` = alias, o alias `null`: solo esa tarea
 *   (not found → `SkippedTaskError('anilist:not_found')`, lo demás `Error`).
 * - Error sin alias (complejidad, sintaxis) o HTTP 429/5xx: falla el grupo.
 * - HTTP 404 (AniList lo usa si **algún** alias no existe, y el fetcher descarta
 *   el body): cada tarea se resuelve por el camino de un medio, con gate.
 * - Páginas extra (`hasNextPage`): cada request paga su cupo en el gate.
 */
type Hydrated = { mediaType: AniListMediaType; media: AniListMediaDeep }
type Wanted = { task: ScrapingTask; anilistId: number; type: AniListMediaType }
interface BatchResponse {
  data?: Record<string, AniListMediaDeep | null> | null
  errors?: { message?: string; path?: (string | number)[] }[]
}

export const buildMediaBatchQuery = (count: number) => {
  const range = Array.from({ length: count }, (_, i) => i)
  const vars = range.map((i) => `$i${i}: Int, $t${i}: MediaType`).join(', ')
  const fields = range.map(
    (i) =>
      `  m${i}: Media(id: $i${i}, type: $t${i}) {\n${mediaDeepSelection('1', '1')}\n  }`
  )
  return `query (${vars}) {\n${fields.join('\n')}\n}`
}

/** Cupo del gate (`graphql.anilist.co` + IP) para cada request extra. */
const gateFor = (proxy?: ProxyTarget) => async () => {
  const { host, limits } = SOURCE_HOSTS.anilistMedia!
  await rateGate.acquire(
    proxyKey(host, typeof proxy === 'string' ? proxy : undefined),
    limits
  )
}

const asError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error))

const aliasError = (message: string) =>
  /not found/i.test(message)
    ? new SkippedTaskError('anilist:not_found')
    : new Error(`AniList: ${message}`)

const requestBatch = (wanted: Wanted[], proxy?: ProxyTarget) =>
  fetcher<BatchResponse>({
    url: CONFIG.ANILIST_BASE,
    method: 'POST',
    headers: ANILIST_HEADERS,
    body: JSON.stringify({
      query: buildMediaBatchQuery(wanted.length),
      variables: Object.fromEntries(
        wanted.flatMap((w, i) => [
          [`i${i}`, w.anilistId],
          [`t${i}`, w.type],
        ])
      ),
    }),
    agent: proxy,
    // ~N veces el body de un medio: más margen que los 8 s de un medio.
    timeoutMs: 20_000,
  })

export const fetchAnilistMediaBatch = async (
  tasks: ScrapingTask[],
  proxy?: ProxyTarget
): Promise<Map<number, Hydrated | Error>> => {
  const out = new Map<number, Hydrated | Error>()
  const wanted: Wanted[] = []
  for (const task of tasks) {
    const { anilistId } = (task.payload ?? {}) as { anilistId?: number }
    if (anilistId) wanted.push({ task, anilistId, type: mediaTypeOf(task) })
    else out.set(task.id, new SkippedTaskError('missing:anilistId'))
  }
  if (wanted.length === 0) return out

  const gate = gateFor(proxy)
  let response: BatchResponse
  try {
    response = await requestBatch(wanted, proxy)
  } catch (error) {
    if (!(error instanceof FetchError && error.kind === 'not_found'))
      throw error
    for (const { task } of wanted)
      out.set(task.id, await fetchMediaDeep(task, proxy, gate).catch(asError))
    return out
  }

  const failed = new Map<string, Error>()
  for (const error of response.errors ?? []) {
    const message = error.message ?? 'unknown error'
    const index = /^m(\d+)$/.exec(String(error.path?.[0] ?? ''))?.[1]
    if (index === undefined || Number(index) >= wanted.length)
      throw new Error(`AniList: ${message}`)
    if (!failed.has(`m${index}`)) failed.set(`m${index}`, aliasError(message))
  }

  for (const [i, { task, anilistId, type }] of wanted.entries()) {
    const alias = `m${i}`
    const data = response.data ?? {}
    if (failed.has(alias)) out.set(task.id, failed.get(alias)!)
    else if (!(alias in data))
      out.set(task.id, new Error(`AniList: alias ${alias} missing`))
    else if (!data[alias])
      out.set(task.id, new SkippedTaskError('anilist:not_found'))
    else {
      const page = async (charPage: number, staffPage: number) => {
        await gate()
        return queryMediaDeep(anilistId, type, charPage, staffPage, proxy)
      }
      const media = await paginateMediaDeep(data[alias]!, page).catch(asError)
      out.set(
        task.id,
        media instanceof Error ? media : { mediaType: type, media }
      )
    }
  }
  return out
}
