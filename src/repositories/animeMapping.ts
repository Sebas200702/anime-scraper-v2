import type {
  AnimeExternalIdsProcessorResult,
  NewAnimeExternalIds,
} from 'types/index.js'
import { db } from '../libs/db.js'
import { animeExternalIds } from '../schemas/animeExternal.js'
import { chunk, SQLITE_MAX_VARIABLES } from '../utils/chunk.js'

export const animeMappingRepository = {
  async upsertAnimeExternalIdsBatch(
    animeExternalIdEntries: NewAnimeExternalIds[]
  ): Promise<number> {
    try {
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 3)
      const chunks = chunk(animeExternalIdEntries, batchSize)
      await db.transaction(async (tx) => {
        for (const batch of chunks) {
          await tx.insert(animeExternalIds).values(batch).onConflictDoNothing()
        }
      })
      return animeExternalIdEntries.length
    } catch (e) {
      // Re-lanzar (ver `saveData`): un fallo de escritura no puede contar como
      // tarea completada.
      console.error('Failed to upsert anime external ids batch:', e)
      throw e
    }
  },
  async saveAnimeMapping(
    animeExternalIdResults: AnimeExternalIdsProcessorResult[]
  ): Promise<number> {
    const externalIds: NewAnimeExternalIds[] = []
    for (const result of animeExternalIdResults) {
      externalIds.push(result.animeExternalIds)
    }
    return await this.upsertAnimeExternalIdsBatch(externalIds)
  },
}
