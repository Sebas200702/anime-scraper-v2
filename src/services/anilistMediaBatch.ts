import { SOURCE_HOSTS } from '../config/sources.js'
import { rateGate } from '../core/genericManager.js'
import { proxyKey } from '../core/rateGate.js'
import { FetchError } from '../libs/httpError.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ProxyTarget } from '../libs/transport.js'
import type { ScrapingTask } from '../types/index.js'
import { fetchMediaDeep, mediaTypeOf } from './anilistMedia/deepQuery.js'
import { requestPage, truncated } from './anilistMedia/pageQuery.js'
import type {
  AniListMediaDeep,
  AniListMediaType,
} from './anilistMedia/types.js'

export {
  PAGE_NESTED_CAP,
  buildMediaBatchQuery,
} from './anilistMedia/pageQuery.js'

/**
 * T11 (S6, L19, L21): N medios por request con
 * `Page(perPage: N) { media(id_in: $ids, type: $type) { … } }` y la misma
 * selección que el camino de un medio. Medido contra AniList (L21): cuenta
 * **1** request contra el límite de 30/min (los alias contaban 1 por alias y
 * 10 alias pasaban la complejidad de 500), y un id inexistente solo falta de
 * `media` (sin 404).
 *
 * - Id ausente de `media` → `SkippedTaskError('anilist:not_found')`, solo él.
 * - Error con ruta `Page.media.<i>` → solo ese medio; error sin datos o sin
 *   ruta, o HTTP 4xx/5xx/429 → falla el grupo.
 * - Dentro de `Page` las conexiones anidadas vuelven **topadas a 25**: un medio
 *   con más personajes o staff se re-pide entero por el camino de un medio
 *   (50 por página, desde la 1), así sus filas son las de ese camino, sin
 *   saltos ni duplicados. Cada uno de esos requests paga su cupo en el gate.
 */
type Hydrated = { mediaType: AniListMediaType; media: AniListMediaDeep }
type Wanted = { task: ScrapingTask; anilistId: number }

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

/**
 * Un 404/400 del `Page` entero no dice qué medio lo causó (L21 mide que un id
 * ausente no da 404): en vez de mandar las N tareas a dead_letter, cada una
 * vuelve al camino de un medio, con su cupo, y conserva su semántica.
 */
const isGroupRejection = (error: unknown) =>
  error instanceof FetchError &&
  (error.kind === 'not_found' || error.kind === 'invalid_body')

export const fetchAnilistMediaBatch = async (
  tasks: ScrapingTask[],
  proxy?: ProxyTarget
): Promise<Map<number, Hydrated | Error>> => {
  const out = new Map<number, Hydrated | Error>()
  const byType = new Map<AniListMediaType, Wanted[]>()
  for (const task of tasks) {
    const { anilistId } = (task.payload ?? {}) as { anilistId?: number }
    if (!anilistId) {
      out.set(task.id, new SkippedTaskError('missing:anilistId'))
      continue
    }
    const type = mediaTypeOf(task)
    byType.set(type, [...(byType.get(type) ?? []), { task, anilistId }])
  }

  const gate = gateFor(proxy)
  let first = true
  for (const [type, wanted] of byType) {
    // El dispatcher agrupa por tipo; si aun así llegan mezclados, cada tipo
    // extra es otro request y paga su cupo. Solo el primero falla el grupo.
    let found: Map<number, AniListMediaDeep | Error>
    try {
      if (!first) await gate()
      found = await requestPage(
        wanted.map((w) => w.anilistId),
        type,
        proxy
      )
    } catch (error) {
      if (isGroupRejection(error)) {
        for (const { task } of wanted) {
          out.set(
            task.id,
            await fetchMediaDeep(task, proxy, gate).catch(asError)
          )
        }
        continue
      }
      if (first) throw error
      for (const { task } of wanted) out.set(task.id, asError(error))
      continue
    } finally {
      first = false
    }
    for (const { task, anilistId } of wanted) {
      const hit = found.get(anilistId)
      if (!hit) out.set(task.id, new SkippedTaskError('anilist:not_found'))
      else if (hit instanceof Error) out.set(task.id, hit)
      else if (truncated(hit))
        out.set(task.id, await fetchMediaDeep(task, proxy, gate).catch(asError))
      else out.set(task.id, { mediaType: type, media: hit })
    }
  }
  return out
}
