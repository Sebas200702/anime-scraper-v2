import type { ArtworksProcessorResult, NewMedia } from '../types/index.js'
import { media } from '../schemas/media.js'
import { db } from '../libs/db.js'
import { chunk, SQLITE_MAX_VARIABLES } from '../utils/chunk.js'

export const tvdbSeriesArtworksRepository = {
  async upsertTvdbSeriesArtworksBatch(
    tvdbSeriesArtworkEntries: NewMedia[]
  ): Promise<number> {
    try {
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 6)
      const chunks = chunk(tvdbSeriesArtworkEntries, batchSize)
      await db.transaction(async (tx) => {
        for (const batch of chunks) {
          await tx.insert(media).values(batch).onConflictDoNothing()
        }
      })
      return tvdbSeriesArtworkEntries.length
    } catch (e) {
      // Re-lanzar (ver `saveData`): un fallo de escritura no puede contar como
      // tarea completada.
      console.error('Failed to upsert TVDB series artworks batch:', e)
      throw e
    }
  },
  async saveTvdbSeriesArtworks(
    tvdbSeriesArtworkResults: ArtworksProcessorResult[]
  ): Promise<number> {
    const artworks: NewMedia[] = []
    for (const result of tvdbSeriesArtworkResults) {
      if (result?.artworks) artworks.push(...result.artworks)
    }
    return await this.upsertTvdbSeriesArtworksBatch(artworks)
  },
}
