import type {
  AnimeExternalIdsProcessorResult,
  NewAnimeExternalIds,
} from 'types/index.js'
import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { animeExternalIds } from '../schemas/animeExternal.js'
import { chunk, MAX_PARAMS_PER_STATEMENT } from '../utils/chunk.js'

export const animeMappingRepository = {
  async upsertAnimeExternalIdsBatch(
    animeExternalIdEntries: NewAnimeExternalIds[]
  ): Promise<number> {
    try {
      const batchSize = Math.floor(MAX_PARAMS_PER_STATEMENT / 3)
      const chunks = chunk(animeExternalIdEntries, batchSize)
      await db.transaction(async (tx) => {
        for (const batch of chunks) {
          // Merge, no `DO NOTHING`: la vía rápida trae ids curados de Kitsu y
          // debe rellenar `tvdb_id` de filas ya existentes. COALESCE conserva
          // lo ya resuelto y solo añade huecos.
          await tx
            .insert(animeExternalIds)
            .values(batch)
            .onConflictDoUpdate({
              target: [animeExternalIds.animeId],
              set: {
                kitsuId: sql`COALESCE(${animeExternalIds.kitsuId}, excluded.${animeExternalIds.kitsuId})`,
                tvdbId: sql`COALESCE(${animeExternalIds.tvdbId}, excluded.${animeExternalIds.tvdbId})`,
                updatedAt: sql`now()`,
              },
            })
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
