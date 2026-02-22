import { fetcher } from '../libs/fetcher.js'
import { CONFIG } from '../config/config.js'
import { authenticate } from '../libs/tvdb.js'
import type { ScrapingTask } from 'types/index.js'
import type { ProxyAgent } from 'undici'
import type { TvdbSeriesResponse } from 'types/tvdbSeriesApi.js'
import type { TvdbMovieResponse } from 'types/tvdbMoviesApi.js'

export const fetchTvdbSeriesArtworks = async (
  task: ScrapingTask,
  agent: ProxyAgent
) => {
  const { tvdb_id, type } = task.payload as {
    tvdb_id: number
    type?: string
  }

  if (!tvdb_id) {
    throw new Error('Task payload missing tvdb_id')
  }

  const token = await authenticate()
  const endpoint = type === 'Movie' ? 'movies' : 'series'
  const url = `${CONFIG.TVDB_BASE}/${endpoint}/${tvdb_id}/extended`

  const response = await fetcher<TvdbSeriesResponse | TvdbMovieResponse>({
    url,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'anime-scraper/1.0',
    },
    agent,
  })

  return response
}
