import type { ArtworksProcessorResult, NewMedia } from '../types/index.js'
import { mediaRepository } from './media.js'

export const tvdbSeriesArtworksRepository = {
  async upsertTvdbSeriesArtworksBatch(
    tvdbSeriesArtworkEntries: NewMedia[]
  ): Promise<number> {
    try {
      // La media vive por entidad y sin índice único en el DDL: el router
      // descarta lo ya presente, así que re-ejecutar no duplica.
      return await mediaRepository.saveMedia(tvdbSeriesArtworkEntries)
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
