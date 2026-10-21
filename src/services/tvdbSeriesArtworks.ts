import { fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import { CONFIG } from '../config/config.js'
import { authenticate } from '../libs/tvdb.js'
import type { ScrapingTask } from 'types/index.js'
import type { ProxyTarget } from '../libs/transport.js'
import type { TvdbSeriesResponse } from 'types/tvdbSeriesApi.js'
import type { TvdbMovieResponse } from 'types/tvdbMoviesApi.js'

export const fetchTvdbSeriesArtworks = async (
  task: ScrapingTask,
  agent: ProxyTarget
) => {
  const { tvdb_id, type } = task.payload as {
    tvdb_id: number
    type?: string
  }

  if (!tvdb_id) {
    // Igual que KitSu: sin tvdb_id (lo aporta animeMapping) no hay endpoint.
    throw new SkippedTaskError('missing:tvdb_id')
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
