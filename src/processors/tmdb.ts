import type { ScrapingTask, TmdbProcessorResult } from '../types/index.js'
import {
  fetchTmdbSeasonStills,
  fetchTmdbSeries,
  fetchTmdbSeriesImages,
  tmdbImageUrl,
} from '../services/tmdb.js'

/**
 * Trae el banner (backdrop) y las miniaturas de episodio (stills) de TMDB.
 *
 * La numeración de MAL de una serie es la concatenación de sus temporadas
 * (1..N de la S1, N+1.. de la S2), así que el `episode_number` de TMDB se
 * desplaza con los episodios de las temporadas anteriores.
 */
export const processTmdbImages = async (
  task: ScrapingTask,
  proxy?: any
): Promise<TmdbProcessorResult> => {
  const { animeId, tmdbId } = task.payload as {
    animeId?: number
    tmdbId?: number
  }
  if (!animeId || !tmdbId) {
    return { animeId: animeId ?? 0, backdrops: [], stills: [], seriesName: null }
  }

  const [{ series, seasons }, images] = await Promise.all([
    fetchTmdbSeries(tmdbId, proxy),
    fetchTmdbSeriesImages(tmdbId, proxy),
  ])

  // Desplazamiento por temporada (en número de episodio de MAL).
  const stills: { number: number; src: string }[] = []
  let offset = 0
  for (const season of seasons.sort(
    (a, b) => a.season_number - b.season_number
  )) {
    const seasonStills = await fetchTmdbSeasonStills(
      tmdbId,
      season.season_number,
      proxy
    )
    for (const still of seasonStills) {
      if (still.episode_number === null) continue
      stills.push({
        number: offset + still.episode_number,
        src: tmdbImageUrl(still.file_path, 'w780'),
      })
    }
    offset += season.episode_count ?? 0
  }

  const backdrops = images.backdrops
    .slice()
    .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
    .slice(0, 2)
    .map((image) => ({
      src: tmdbImageUrl(image.file_path, 'w1280'),
      lang: image.iso_639_1 ?? null,
    }))

  return { animeId, backdrops, stills, seriesName: series.name ?? null }
}
