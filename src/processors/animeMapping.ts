import type {
  AnimeExternalIdsProcessorResult,
  ScrapingTask,
} from '../types/index.js'

export const processAnimeMapping = (
  rawData: { kitsuId: number | null; tvdbId: number | null },
  task: ScrapingTask
) => {
  // Extract the numeric malId from entityId (e.g. "anime_mapping_123" → 123)
  const malId = Number(task.entityId.replace('anime_mapping_', ''))
  const externalIdResult: AnimeExternalIdsProcessorResult = {
    animeExternalIds: {
      animeId: malId,
      kitsuId: rawData.kitsuId,
      tvdbId: rawData.tvdbId,
    },
  }
  return externalIdResult
}
