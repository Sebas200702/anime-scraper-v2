/**
 * API de TMDB (v3) para banners (backdrops) y miniaturas de episodio (stills).
 *
 * Requiere una API key gratuita (`https://www.themoviedb.org/settings/api`,
 * "API Key (v3 auth)"). Sin `TMDB_API_KEY` la fuente **no hace nada**: es
 * mejor no gastar cola que dejar 30.000 tareas en `skipped`.
 *
 * Lo que aporta:
 * - `backdrop_path` → el **banner** de la serie (la fuente más completa:
 *   cubre_series que ni MAL ni TVDB consideran),
 * - `stills` → la **miniatura de cada episodio**, con `episode_number` (la
 *   numeración estándar, que es la de MAL).
 */
import { CONFIG } from '../config/config.js'
import { fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ProxyTarget } from '../libs/transport.js'
import type { ScrapingTask } from 'types/index.js'

export const TMDB_BASE = 'https://api.themoviedb.org/3'

/** Key de TMDB (vacía = la fuente queda deshabilitada). */
export const tmdbApiKey = (): string => process.env.TMDB_API_KEY ?? ''

export const hasTmdbKey = (): boolean => tmdbApiKey().length > 0

export interface TmdbImage {
  file_path: string
  iso_639_1?: string
  vote_average?: number
  width?: number
  height?: number
}

export interface TmdbSeason {
  id: number
  season_number: number
  episode_count: number
  name?: string
}

export interface TmdbSeries {
  id: number
  name?: string
  original_name?: string
  first_air_date?: string
  number_of_seasons?: number
  seasons?: TmdbSeason[]
}

export interface TmdbStill {
  file_path: string
  episode_number: number | null
  season_number?: number
}

const imageUrl = (path: string, size: 'w780' | 'w1280' | 'original'): string =>
  `https://image.tmdb.org/t/p/${size}${path}`

/** Búsqueda de serie por título (para el mapeo MAL → TMDB). */
export const searchTmdbSeries = async (
  query: string,
  year: number | null,
  proxy?: ProxyTarget
): Promise<{ id: number; name: string; firstAirDate: string | null }[]> => {
  const key = tmdbApiKey()
  if (!key) throw new SkippedTaskError('missing:TMDB_API_KEY')
  const url =
    `${TMDB_BASE}/search/tv?api_key=${encodeURIComponent(key)}` +
    `&query=${encodeURIComponent(query)}&language=en-US` +
    (year ? `&first_air_date_year=${year}` : '') +
    '&include_adult=false'
  const response = await fetcher<{
    results?: {
      id: number
      name?: string
      original_name?: string
      first_air_date?: string
    }[]
  }>({
    url,
    method: 'GET',
    headers: { Accept: 'application/json' },
    agent: proxy,
  })
  return (response.results ?? []).map((r) => ({
    id: r.id,
    name: r.original_name || r.name || '',
    firstAirDate: r.first_air_date ?? null,
  }))
}

/** Ficha de la serie: temporadas con su número de episodios. */
export const fetchTmdbSeries = async (
  tmdbId: number,
  proxy?: ProxyTarget
): Promise<{ series: TmdbSeries; seasons: TmdbSeason[] }> => {
  const key = tmdbApiKey()
  if (!key) throw new SkippedTaskError('missing:TMDB_API_KEY')
  const response = await fetcher<{ data?: TmdbSeries }>({
    url: `${TMDB_BASE}/tv/${tmdbId}?api_key=${encodeURIComponent(key)}&language=en-US`,
    method: 'GET',
    headers: { Accept: 'application/json' },
    agent: proxy,
  })
  const data = response.data
  return {
    series: data ?? { id: tmdbId },
    seasons: (data?.seasons ?? []).filter((s) => s.season_number > 0),
  }
}

/** Imágenes de la serie: backdrops (banner) y posters. */
export const fetchTmdbSeriesImages = async (
  tmdbId: number,
  proxy?: ProxyTarget
): Promise<{ backdrops: TmdbImage[]; posters: TmdbImage[] }> => {
  const key = tmdbApiKey()
  if (!key) throw new SkippedTaskError('missing:TMDB_API_KEY')
  const response = await fetcher<{
    backdrops?: TmdbImage[]
    posters?: TmdbImage[]
  }>({
    url: `${TMDB_BASE}/tv/${tmdbId}/images?api_key=${encodeURIComponent(key)}&include_image_language=en,null`,
    method: 'GET',
    headers: { Accept: 'application/json' },
    agent: proxy,
  })
  return {
    backdrops: response.backdrops ?? [],
    posters: response.posters ?? [],
  }
}

/** Miniaturas de los episodios de una temporada (`episode_number` incluido). */
export const fetchTmdbSeasonStills = async (
  tmdbId: number,
  seasonNumber: number,
  proxy?: ProxyTarget
): Promise<TmdbStill[]> => {
  const key = tmdbApiKey()
  if (!key) throw new SkippedTaskError('missing:TMDB_API_KEY')
  const response = await fetcher<{ stills?: TmdbStill[] }>({
    url:
      `${TMDB_BASE}/tv/${tmdbId}/season/${seasonNumber}/images` +
      `?api_key=${encodeURIComponent(key)}&include_image_language=en,null`,
    method: 'GET',
    headers: { Accept: 'application/json' },
    agent: proxy,
  })
  return response.stills ?? []
}

export { imageUrl as tmdbImageUrl, CONFIG as tmdbConfig }
