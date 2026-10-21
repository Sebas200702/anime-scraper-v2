import { CONFIG } from '../config/config.js'
import { fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ProxyTarget } from '../libs/transport.js'
import type { ScrapingTask } from 'types/index.js'

/**
 * MAL API oficial v2: la fuente **canónica** de lo que Jikan da y solo MAL
 * tiene bien (studios/licensors con ids MAL, géneros/demográficas/temas con ids
 * MAL, stats de comunidad, broadcast, duración, sinopsis, aired).
 *
 * Requiere `MAL_CLIENT_ID` (registro gratuito e instantáneo en
 * https://myanimelist.net/apiconfig). Sin él la fuente queda `skipped`.
 */
const FIELDS = [
  'id',
  'title',
  'main_picture',
  'alternative_titles',
  'start_date',
  'end_date',
  'synopsis',
  'mean',
  'rank',
  'popularity',
  'num_list_users',
  'num_scoring_users',
  'genres',
  'explicit_genres',
  'themes',
  'demographics',
  'media_type',
  'status',
  'num_episodes',
  'start_season',
  'broadcast',
  'source',
  'average_episode_duration',
  'rating',
  'studios',
  'background',
].join(',')

/** Campos mínimos si el endpoint rechaza alguno de los nuevos (defensa). */
const FIELDS_MIN = ['id', 'title', 'genres', 'studios', 'broadcast'].join(',')

export interface MalAnimeDetails {
  id: number
  title?: string
  alternative_titles?: {
    synonyms?: string[]
    en?: string
    ja?: string
  }
  start_date?: string
  end_date?: string
  synopsis?: string
  background?: string
  mean?: number
  rank?: number
  popularity?: number
  num_list_users?: number
  num_scoring_users?: number
  genres?: { id: number; name: string }[]
  explicit_genres?: { id: number; name: string }[]
  themes?: { id: number; name: string }[]
  demographics?: { id: number; name: string }[]
  media_type?: string
  status?: string
  num_episodes?: number
  start_season?: { year?: number; season?: string }
  broadcast?: { day_of_the_week?: string; start_time?: string }
  source?: string
  average_episode_duration?: number
  rating?: string
  studios?: { id: number; name: string }[]
}

export const fetchAnimeMalDetails = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
) => {
  const { animeId } = task.payload as { animeId?: number }
  if (!animeId) throw new SkippedTaskError('missing:animeId')
  const clientId = CONFIG.MAL_CLIENT_ID
  if (!clientId) throw new SkippedTaskError('missing:MAL_CLIENT_ID')

  const url = `${CONFIG.MAL_API_BASE}/anime/${animeId}?fields=${FIELDS}&nsfw=true`

  const call = (fields: string) => () =>
    fetcher<MalAnimeDetails>({
      url: `${CONFIG.MAL_API_BASE}/anime/${animeId}?fields=${fields}&nsfw=true`,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-MAL-CLIENT-ID': clientId,
      },
      agent: proxy,
      timeoutMs: 8_000,
    })
  void url

  try {
    return await call(FIELDS)()
  } catch {
    // Algún campo nuevo rechazado por el endpoint: se reintenta con el mínimo.
    return await call(FIELDS_MIN)()
  }
}

/**
 * MAL API oficial v2, endpoint de **listado**: trae 500 anime por request con
 * los mismos campos que el detalle (géneros, studios, stats, sinopsis,
 * broadcast…). Es lo que hace viable el backfill completo: ~60 requests en vez
 * de 30.000 y sin acercarse al límite por IP.
 */
const RANKING_FIELDS = [
  'id',
  'title',
  'main_picture',
  'alternative_titles',
  'start_date',
  'end_date',
  'synopsis',
  'mean',
  'rank',
  'popularity',
  'num_list_users',
  'num_scoring_users',
  'genres',
  'media_type',
  'status',
  'num_episodes',
  'start_season',
  'broadcast',
  'source',
  'average_episode_duration',
  'rating',
  'studios',
].join(',')

/** Tipos de ranking que se recorren para maximizar cobertura del catálogo. */
export const MAL_RANKING_TYPES = [
  'all',
  'bypopularity',
  'favorite',
  'airing',
  'upcoming',
] as const

interface MalRankingResponse {
  data?: { node: MalAnimeDetails }[]
}

export const fetchMalRanking = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<{ nodes: MalAnimeDetails[] }> => {
  const { rankingType } = task.payload as { rankingType?: string }
  if (!rankingType) throw new SkippedTaskError('missing:rankingType')
  const clientId = CONFIG.MAL_CLIENT_ID
  if (!clientId) throw new SkippedTaskError('missing:MAL_CLIENT_ID')

  const limit = 500
  const nodes: MalAnimeDetails[] = []
  for (let offset = 0; ; offset += limit) {
    const response = await fetcher<MalRankingResponse>({
      url:
        `${CONFIG.MAL_API_BASE}/anime/ranking?ranking_type=${rankingType}` +
        `&limit=${limit}&offset=${offset}&fields=${RANKING_FIELDS}`,
      method: 'GET',
      headers: { Accept: 'application/json', 'X-MAL-CLIENT-ID': clientId },
      agent: proxy,
      timeoutMs: 20_000,
    })

    const batch = (response.data ?? []).map((d) => d.node).filter(Boolean)
    nodes.push(...batch)
    if (batch.length < limit) break
  }

  return { nodes }
}
