import type { ArtworksProcessorResult, NewMedia } from '../types/index.js'
import { media } from '../schemas/media.js'
import { db } from '../libs/db.js'

export const tvdbSeriesArtworksRepository = {
  async upsertTvdbSeriesArtworksBatch(
    tvdbSeriesArtworkEntries: NewMedia[]
  ): Promise<number> {
    try {
      await db
        .insert(media)
        .values(tvdbSeriesArtworkEntries)
        .onConflictDoNothing()
      return tvdbSeriesArtworkEntries.length
    } catch (e) {
      console.error('Failed to upsert TVDB series artworks batch:', e)
      return 0
    }
  },
  async saveArtworks(
    tvdbSeriesArtworkResults: ArtworksProcessorResult[]
  ): Promise<void> {
    const artworks: NewMedia[] = []
    for (const result of tvdbSeriesArtworkResults) {
      artworks.push(...result.artworks)
    }
    await this.upsertTvdbSeriesArtworksBatch(artworks)
  },
}
