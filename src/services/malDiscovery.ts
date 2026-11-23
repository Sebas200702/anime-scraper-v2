import { CONFIG } from '../config/config.js'
import { fetcher, type RetryPolicy } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ProxyTarget } from '../libs/transport.js'
import { processMalDiscoveryMangaRanking } from '../processors/malDiscoveryManga.js'
import { malDiscoveryRepository } from '../repositories/malDiscovery.js'
import { taskRepository } from '../repositories/tasks.js'
import { TaskContinuation } from '../shared/taskContinuation.js'
import { malSeasonAt, type MalSeasonName } from '../shared/malSeason.js'
import type { MalAnimeDetails } from '../types/malApi.js'
import type { ScrapingTask } from '../types/index.js'
import { RANKING_FIELDS } from './mal.js'
import type { MalMangaNode } from './malManga.js'
import { runMangaSweep, sweepCursor } from './malDiscoveryMangaSweep.js'

/**
 * Descubrimiento de anime nuevos sin Jikan: listas de temporada y rankings
 * `upcoming`/`airing` de la MAL API v2 (500 por request, mismos campos que el
 * ranking bulk). `nsfw=true` como el detalle por-anime. Manga (S6): ranking de
 * manga con los campos mínimos de la fila; la ficha la trae `malManga`.
 */
const LIMIT = 500

/** Campos de la fila mínima de `manga` (S6). */
export const MANGA_DISCOVERY_FIELDS = [
  'id',
  'title',
  'media_type',
  'status',
  'num_chapters',
  'num_volumes',
  'start_date',
].join(',')

export type MalDiscoveryTarget =
  | { kind: 'season'; year: number; season: MalSeasonName }
  | { kind: 'ranking'; rankingType: string }
  | { kind: 'mangaRanking'; rankingType: string }

const PATHS = {
  ranking: '/anime/ranking',
  mangaRanking: '/manga/ranking',
} as const

export const malDiscoveryListUrl = (
  base: string,
  target: MalDiscoveryTarget,
  offset: number
): string => {
  const path =
    target.kind === 'season'
      ? `/anime/season/${target.year}/${target.season}`
      : PATHS[target.kind]
  const query = new URLSearchParams()
  if (target.kind !== 'season') query.set('ranking_type', target.rankingType)
  query.set('limit', String(LIMIT))
  query.set('offset', String(offset))
  query.set(
    'fields',
    target.kind === 'mangaRanking' ? MANGA_DISCOVERY_FIELDS : RANKING_FIELDS
  )
  query.set('nsfw', 'true')
  return `${base}${path}?${query.toString()}`
}

interface MalListResponse<T> {
  data?: { node: T }[]
}

/**
 * Una página del listado (`LIMIT` nodos como máximo). `retry` solo lo pasa el
 * barrido de manga (reintenta por página él mismo); el anime usa el default.
 */
export const fetchMalDiscoveryPage = async <T = MalAnimeDetails>(
  target: MalDiscoveryTarget,
  offset: number,
  proxy?: ProxyTarget,
  retry?: Partial<RetryPolicy>
): Promise<T[]> => {
  const clientId = CONFIG.MAL_CLIENT_ID
  if (!clientId) throw new SkippedTaskError('missing:MAL_CLIENT_ID')
  const response = await fetcher<MalListResponse<T>>({
    url: malDiscoveryListUrl(CONFIG.MAL_API_BASE, target, offset),
    method: 'GET',
    headers: { Accept: 'application/json', 'X-MAL-CLIENT-ID': clientId },
    agent: proxy,
    timeoutMs: 20_000,
    ...(retry ? { retry } : {}),
  })
  return (response.data ?? []).map((d) => d.node).filter(Boolean)
}

/** Pagina hasta una página corta (menos de `LIMIT` nodos). */
const fetchAll = async <T = MalAnimeDetails>(
  target: MalDiscoveryTarget,
  proxy?: ProxyTarget
): Promise<{ nodes: T[] }> => {
  const nodes: T[] = []
  for (let offset = 0; ; offset += LIMIT) {
    const batch = await fetchMalDiscoveryPage<T>(target, offset, proxy)
    nodes.push(...batch)
    if (batch.length < LIMIT) break
  }
  return { nodes }
}

export const fetchMalDiscoverySeason = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
) => {
  const { seasonOffset } = task.payload as { seasonOffset?: number }
  if (seasonOffset === undefined)
    throw new SkippedTaskError('missing:seasonOffset')
  const { year, season } = malSeasonAt(new Date(), seasonOffset)
  return await fetchAll({ kind: 'season', year, season }, proxy)
}

export const fetchMalDiscoveryRanking = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
) => {
  const { rankingType } = task.payload as { rankingType?: string }
  if (!rankingType) throw new SkippedTaskError('missing:rankingType')
  return await fetchAll({ kind: 'ranking', rankingType }, proxy)
}

/**
 * Ranking de manga (S6, L9): barrido reanudable por tramos. Cada página se
 * guarda al llegar (solo inserta desconocidos) y el cursor (`offset`) queda en
 * el payload de la tarea. Si el tramo no termina, la tarea vuelve a `pending`
 * (`TaskContinuation`); con la página corta se completa con su refresco
 * semanal y el cursor en 0. Los reintentos por página los hace el barrido
 * (backoff propio), así que el fetcher hace un solo intento.
 */
export const fetchMalDiscoveryMangaRanking = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<{ nodes: MalMangaNode[]; inserted: number } | TaskContinuation> => {
  const { rankingType, offset } = task.payload as {
    rankingType?: string
    offset?: unknown
  }
  if (!rankingType) throw new SkippedTaskError('missing:rankingType')
  const target: MalDiscoveryTarget = { kind: 'mangaRanking', rankingType }
  const result = await runMangaSweep({
    startOffset: sweepCursor(offset),
    fetchPage: (pageOffset) =>
      fetchMalDiscoveryPage<MalMangaNode>(target, pageOffset, proxy, {
        maxAttempts: 1,
      }),
    savePage: (nodes) =>
      malDiscoveryRepository.saveMalDiscoveryMangaRanking([
        processMalDiscoveryMangaRanking({ nodes }, task),
      ]),
    saveCursor: (next) =>
      taskRepository.mergeTaskPayload(task.id, { offset: next }),
  })
  if (!result.done)
    return new TaskContinuation(
      `${result.pages} páginas, ${result.inserted} manga nuevos; cursor ${result.nextOffset}`
    )
  return { nodes: [], inserted: result.inserted }
}
