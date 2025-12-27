import type {
  AnimeExternalIdsProcessorResult,
  NewAnimeExternalIds,
} from 'types/index.js'
import { db } from '../libs/db.js'
import { animeExternalIds } from '../schemas/animeExternal.js'
export const animeMappingRepository = {
  async upsertAnimeExternalIdsBatch(
    animeExternalIdEntries: NewAnimeExternalIds[]
  ): Promise<number> {
    try {
      await db
        .insert(animeExternalIds)
        .values(animeExternalIdEntries)
        .onConflictDoNothing()
      return animeExternalIdEntries.length
    } catch (e) {
      console.error('Failed to upsert anime external ids batch:', e)
      return 0
    }
  },
  async saveAnimeMapping(
    animeExternalIdResults: AnimeExternalIdsProcessorResult[]
  ): Promise<void> {
    const externalIds: NewAnimeExternalIds[] = []
    for (const result of animeExternalIdResults) {
      externalIds.push(result.animeExternalIds)
    }
    await this.upsertAnimeExternalIdsBatch(externalIds)
  },
}
