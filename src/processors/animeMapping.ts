import type {
  AnimeExternalIdsProcessorResult,
  ScrapingTask,
} from '../types/index.js'

export const processAnimeMapping = (
  rawData: { kitsuId: number; tvdbId: number },
  task: ScrapingTask
) => {
  const { anime_id } = task.payload as { anime_id: number }
  const externalIdResult: AnimeExternalIdsProcessorResult = {
    animeExternalIds: {
      animeId: anime_id,
      kitsuId: rawData.kitsuId,
      tvdbId: rawData.tvdbId,
    },
  }
  return externalIdResult
}
