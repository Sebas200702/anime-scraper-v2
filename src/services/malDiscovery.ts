import { CONFIG } from '../config/config.js'
import { fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ProxyTarget } from '../libs/transport.js'
import { malSeasonAt, type MalSeasonName } from '../shared/malSeason.js'
import type { MalAnimeDetails } from '../types/malApi.js'
import type { ScrapingTask } from '../types/index.js'
import { RANKING_FIELDS } from './mal.js'

/**
 * Descubrimiento de anime nuevos sin Jikan: listas de temporada y rankings
 * `upcoming`/`airing` de la MAL API v2 (500 por request, mismos campos que el
 * ranking bulk). `nsfw=true` como el detalle por-anime.
 */
const LIMIT = 500

export type MalDiscoveryTarget =
  | { kind: 'season'; year: number; season: MalSeasonName }
  | { kind: 'ranking'; rankingType: string }

export const malDiscoveryListUrl = (
  base: string,
  target: MalDiscoveryTarget,
  offset: number
): string => {
  const path =
    target.kind === 'season'
      ? `/anime/season/${target.year}/${target.season}`
      : '/anime/ranking'
  const query = new URLSearchParams()
  if (target.kind === 'ranking') query.set('ranking_type', target.rankingType)
  query.set('limit', String(LIMIT))
  query.set('offset', String(offset))
  query.set('fields', RANKING_FIELDS)
  query.set('nsfw', 'true')
  return `${base}${path}?${query.toString()}`
}

interface MalListResponse {
  data?: { node: MalAnimeDetails }[]
}

/** Pagina hasta una página corta (menos de `LIMIT` nodos). */
const fetchAll = async (
  target: MalDiscoveryTarget,
  proxy?: ProxyTarget
): Promise<{ nodes: MalAnimeDetails[] }> => {
  const clientId = CONFIG.MAL_CLIENT_ID
  if (!clientId) throw new SkippedTaskError('missing:MAL_CLIENT_ID')

  const nodes: MalAnimeDetails[] = []
  for (let offset = 0; ; offset += LIMIT) {
    const response = await fetcher<MalListResponse>({
      url: malDiscoveryListUrl(CONFIG.MAL_API_BASE, target, offset),
      method: 'GET',
      headers: { Accept: 'application/json', 'X-MAL-CLIENT-ID': clientId },
      agent: proxy,
      timeoutMs: 20_000,
    })
    const batch = (response.data ?? []).map((d) => d.node).filter(Boolean)
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
