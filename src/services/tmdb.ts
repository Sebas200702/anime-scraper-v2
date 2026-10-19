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
): Promise<
  {
    id: number
    name: string
    originalName: string
    firstAirDate: string | null
    mediaType: 'tv' | 'movie' | null
  }[]
> => {
  const key = tmdbApiKey()
  if (!key) throw new SkippedTaskError('missing:TMDB_API_KEY')
  const url =
    `${TMDB_BASE}/search/multi?api_key=${encodeURIComponent(key)}` +
    `&query=${encodeURIComponent(query)}&language=en-US` +
    '&include_adult=false'
  const response = await fetcher<{
    results?: {
      id: number
      name?: string
      title?: string
      original_name?: string
      original_title?: string
      first_air_date?: string
      release_date?: string
      media_type?: string
    }[]
  }>({
    url,
    method: 'GET',
    headers: { Accept: 'application/json' },
    agent: proxy,
  })
  // Se devuelven los **dos** nombres: TMDB trae el original (japonés a
  // menudo) y el traducido, y nuestro título puede ser cualquiera de los dos.
  return (response.results ?? [])
    .filter((r) => r.media_type === 'tv' || r.media_type === 'movie')
    .map((r) => ({
      id: r.id,
      // Las películas traen `title`/`original_title`; las series, `name`/
      // `original_name`.
      name: r.name ?? r.title ?? '',
      originalName: r.original_name ?? r.original_title ?? '',
      firstAirDate: r.first_air_date ?? r.release_date ?? null,
      mediaType: (r.media_type as 'tv' | 'movie') ?? null,
    }))
}

/**
 * Ficha de la serie: temporadas con su número de episodios.
 *
 * En TMDB las **películas** cuelgan de `/movie/{id}` (no de `/tv/{id}`): nuestro
 * catálogo tiene 5.060 películas, así que se prueban las dos rutas y se guarda con
 * cuál respondió.
 */
export const fetchTmdbSeries = async (
  tmdbId: number,
  proxy?: ProxyTarget
): Promise<{
  series: TmdbSeries
  seasons: TmdbSeason[]
  mediaType: 'tv' | 'movie'
}> => {
  const key = tmdbApiKey()
  if (!key) throw new SkippedTaskError('missing:TMDB_API_KEY')

  for (const mediaType of ['tv', 'movie'] as const) {
    try {
      // Ojo: en la API **v3** el objeto viene en la raíz (el envoltorio
      // `{ data: ... }` es de la v4).
      const response = await fetcher<TmdbSeries & { status_message?: string }>({
        url: `${TMDB_BASE}/${mediaType}/${tmdbId}?api_key=${encodeURIComponent(key)}&language=en-US`,
        method: 'GET',
        headers: { Accept: 'application/json' },
        agent: proxy,
      })
      if (response?.id && !response.status_message) {
        return {
          series: response,
          seasons: (response.seasons ?? []).filter((s) => s.season_number > 0),
          mediaType,
        }
      }
    } catch (error) {
      // 404 en /tv/ → probar /movie/; si no,rethrow.
      if (!(error instanceof Error) || !/404/.test(error.message)) throw error
    }
  }
  throw new Error(`TMDB: ${tmdbId} no existe ni como serie ni como película`)
}

/** Imágenes de la serie: backdrops (banner) y posters. */
export const fetchTmdbSeriesImages = async (
  tmdbId: number,
  proxy?: ProxyTarget,
  mediaType: 'tv' | 'movie' = 'tv'
): Promise<{ backdrops: TmdbImage[]; posters: TmdbImage[] }> => {
  const key = tmdbApiKey()
  if (!key) throw new SkippedTaskError('missing:TMDB_API_KEY')
  const response = await fetcher<{
    id?: number
    backdrops?: TmdbImage[]
    posters?: TmdbImage[]
    status_message?: string
  }>({
    url: `${TMDB_BASE}/${mediaType}/${tmdbId}/images?api_key=${encodeURIComponent(key)}&include_image_language=en,null`,
    method: 'GET',
    headers: { Accept: 'application/json' },
    agent: proxy,
  })
  return {
    backdrops: response?.backdrops ?? [],
    posters: response?.posters ?? [],
  }
}

/** Miniaturas de los episodios de una temporada (`episode_number` incluido). */
export const fetchTmdbSeasonStills = async (
  tmdbId: number,
  seasonNumber: number,
  proxy?: ProxyTarget,
  mediaType: 'tv' | 'movie' = 'tv'
): Promise<TmdbStill[]> => {
  const key = tmdbApiKey()
  if (!key) throw new SkippedTaskError('missing:TMDB_API_KEY')
  const response = await fetcher<{ stills?: TmdbStill[]; status_message?: string }>({
    url:
      `${TMDB_BASE}/${mediaType}/${tmdbId}/season/${seasonNumber}/images` +
      `?api_key=${encodeURIComponent(key)}&include_image_language=en,null`,
    method: 'GET',
    headers: { Accept: 'application/json' },
    agent: proxy,
  })
  return response.stills ?? []
}

/**
 * Datos de imágenes de una serie de TMDB: temporadas, backdrops y stills.
 *
 * El nombre importa: el `GenericManager` resuelve la función del servicio por
 * convención (`fetch<Entity>`), con `entity: 'tmdbImages'`.
 */
export const fetchTmdbImages = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<{
  animeId: number
  tmdbId: number
  seriesName: string | null
  seasons: TmdbSeason[]
  backdrops: TmdbImage[]
  stills: TmdbStill[]
  episodes: TmdbEpisode[]
}> => {
  const { animeId, tmdbId } = task.payload as {
    animeId?: number
    tmdbId?: number
  }
  if (!animeId || !tmdbId) {
    throw new SkippedTaskError('missing:tmdbId')
  }

  const { series, seasons, mediaType } = await fetchTmdbSeries(tmdbId, proxy)
  const images = await fetchTmdbSeriesImages(tmdbId, proxy, mediaType)

  const stills: TmdbStill[] = []
  const episodes: TmdbEpisode[] = []
  if (mediaType === 'tv') {
    for (const season of seasons.sort(
      (a, b) => a.season_number - b.season_number
    )) {
      stills.push(
        ...(await fetchTmdbSeasonStills(
          tmdbId,
          season.season_number,
          proxy,
          mediaType
        ))
      )
      episodes.push(
        ...(await fetchTmdbSeasonEpisodes(
          tmdbId,
          season.season_number,
          proxy,
          mediaType
        ))
      )
    }
  }

  return {
    animeId,
    tmdbId,
    seriesName: series.name ?? null,
    seasons,
    backdrops: images.backdrops,
    stills,
    episodes,
  }
}

/**
 * Stills de **un episodio** (`/season/{n}/episode/{m}/images`).
 *
 * El endpoint de temporada devuelve los *posters* de la temporada (no los
 * fotogramas de cada capitulo): para las miniaturas de episodio hay que pedir
 * capitulo a capitulo, y de ahi que devuelva varias versiones (`stills`) de las
 * que se elige la mejor valorada.
 */
export const fetchTmdbEpisodeStills = async (
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  proxy?: ProxyTarget,
  mediaType: 'tv' | 'movie' = 'tv'
): Promise<TmdbStill[]> => {
  const key = tmdbApiKey()
  if (!key) throw new SkippedTaskError('missing:TMDB_API_KEY')
  const response = await fetcher<{
    stills?: TmdbStill[]
    status_message?: string
  }>({
    url:
      `${TMDB_BASE}/${mediaType}/${tmdbId}/season/${seasonNumber}` +
      `/episode/${episodeNumber}/images` +
      `?api_key=${encodeURIComponent(key)}&include_image_language=en,null`,
    method: 'GET',
    headers: { Accept: 'application/json' },
    agent: proxy,
  })
  return response?.stills ?? []
}

/** Episodios de una temporada: número, nombre y fecha de emisión. */
export interface TmdbEpisode {
  id: number
  episode_number: number | null
  season_number: number | null
  name: string | null
  air_date: string | null
  overview?: string | null
  runtime?: number | null
  still_path?: string | null
}

export const fetchTmdbSeasonEpisodes = async (
  tmdbId: number,
  seasonNumber: number,
  proxy?: ProxyTarget,
  mediaType: 'tv' | 'movie' = 'tv'
): Promise<TmdbEpisode[]> => {
  const key = tmdbApiKey()
  if (!key) throw new SkippedTaskError('missing:TMDB_API_KEY')
  const response = await fetcher<{
    episodes?: TmdbEpisode[]
    status_message?: string
  }>({
    url:
      `${TMDB_BASE}/${mediaType}/${tmdbId}/season/${seasonNumber}` +
      `?api_key=${encodeURIComponent(key)}&language=en-US`,
    method: 'GET',
    headers: { Accept: 'application/json' },
    agent: proxy,
  })
  return response?.episodes ?? []
}

export { imageUrl as tmdbImageUrl, CONFIG as tmdbConfig }
