import type { ScrapingTask, TmdbProcessorResult } from '../types/index.js'
import { tmdbImageUrl } from '../services/tmdb.js'

/**
 * Banner (backdrop) y miniaturas de episodio (stills) de TMDB.
 *
 * Recibe los datos crudos del servicio (`fetchTmdbImages`) y los mapea.
 *
 * La numeración de MAL de una serie es la concatenación de sus temporadas
 * (1..N de la S1, N+1.. de la S2), así que el `episode_number` de TMDB se
 * desplaza con los episodios de las temporadas anteriores.
 */
export const processTmdbImages = (
  raw: {
    animeId: number
    seasons: { season_number: number; episode_count: number }[]
    backdrops: {
      file_path: string
      iso_639_1?: string
      vote_average?: number
    }[]
    stills: {
      file_path: string
      episode_number: number | null
      season_number?: number
      vote_average?: number
    }[]
    episodes?: {
      episode_number: number | null
      season_number: number | null
      name: string | null
      air_date: string | null
    }[]
    seriesName: string | null
  },
  _task: ScrapingTask
): TmdbProcessorResult => {
  const stills: { number: number; src: string }[] = []
  let offset = 0
  for (const season of [...raw.seasons].sort(
    (a, b) => a.season_number - b.season_number
  )) {
    for (const still of raw.stills.filter(
      (s) => (s.season_number ?? 1) === season.season_number
    )) {
      if (still.episode_number === null) continue
      stills.push({
        number: offset + still.episode_number,
        src: tmdbImageUrl(still.file_path, 'w780'),
      })
    }
    offset += season.episode_count ?? 0
  }

  const backdrops = raw.backdrops
    .slice()
    .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
    .slice(0, 2)
    .map((image) => ({
      src: tmdbImageUrl(image.file_path, 'w1280'),
      lang: image.iso_639_1 ?? null,
    }))

  // Episodios (título y fecha) con el desplazamiento de temporada.
  const episodes: { number: number; title: string | null; aired: string | null }[] =
    []
  let episodeOffset = 0
  for (const season of [...raw.seasons].sort(
    (a, b) => a.season_number - b.season_number
  )) {
    for (const episode of (raw.episodes ?? []).filter(
      (e) => (e.season_number ?? 1) === season.season_number
    )) {
      if (episode.episode_number === null) continue
      episodes.push({
        number: episodeOffset + episode.episode_number,
        title: episode.name?.trim() || null,
        aired: episode.air_date?.slice(0, 10) || null,
      })
    }
    episodeOffset += season.episode_count ?? 0
  }

  return {
    animeId: raw.animeId,
    backdrops,
    stills,
    episodes,
    seriesName: raw.seriesName,
  }
}
