import type { EpisodeProcessorResult, ScrapingTask } from '../types/index.js'
import type { Episodes } from '../types/kitsuApi.js'

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
  }
  return episodesResult
}
