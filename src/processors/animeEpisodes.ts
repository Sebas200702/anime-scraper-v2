import type { EpisodeProcessorResult, ScrapingTask } from '../types/index.js'
import type { Episodes } from '../types/kitsuApi.js'

/**
 * Mapea los episodios de Kitsu a `episode` **y a su miniatura**.
 *
 * Kitsu ya entregaba `attributes.thumbnail.original` (tipado en
 * `types/kitsuApi.ts`) y el mapper lo descartaba: por eso había 400k episodios
 * con texto y `episode_media` vacío. La app resuelve
 * `/media/episode/{id}/thumbnail` con `media_type = 'thumbnail'`
 * (`EPISODE_THUMBNAIL_MEDIA_TYPE` en anidev).
 */
export const processAnimeEpisodes = (
  rawData: { data: Episodes[] },
  task: ScrapingTask
) => {
  const { anime_id } = task.payload as { anime_id: number }

  const episodesResult: EpisodeProcessorResult = {
    episodes: rawData.data.map((episode) => ({
      animeId: anime_id,
      title:
        episode.attributes.titles.en_us ||
        episode.attributes.canonicalTitle ||
        '',
      number: episode.attributes.number,
      synopsis: episode.attributes.synopsis || '',
      duration: `${episode.attributes.length} min`,
      aired: episode.attributes.airdate,
    })),
    // Las miniaturas se guardan aparte: la tabla `episode_media` necesita el
    // `id` del episodio, que lo asigna la DB al insertarlo.
    episodeMedia: rawData.data
      .filter((episode) => episode.attributes.thumbnail?.original)
      .map((episode) => ({
        animeId: anime_id,
        number: episode.attributes.number,
        src: episode.attributes.thumbnail!.original,
      })),
  }
  return episodesResult
}
