import type { ArtworksProcessorResult, ScrapingTask } from '../types/index.js'
import { artworksTypes } from '../types/tvdbArtworks.js'
import type { TvdbMovieResponse } from '../types/tvdbMoviesApi.js'
import type { TvdbSeriesResponse } from '../types/tvdbSeriesApi.js'

function getTypeName(typeId: number, recordType: string) {
  if (recordType === 'season' && typeId === 6) return 'Banner (Season)'
  if (recordType === 'season' && typeId === 7) return 'Poster (Season)'
  const typeObj = artworksTypes.find(
    (t) => t.id === typeId && (!recordType || t.recordType === recordType)
  )
  return typeObj ? typeObj.name : String(typeId)
}

export function processTvdbSeriesArtworks(
  rawData: TvdbMovieResponse | TvdbSeriesResponse,
  task: ScrapingTask
) {
  const { anime_id, type } = task.payload as { anime_id: number; type?: string }
  const recordType = type === 'movie' ? 'movie' : 'series'

  if (!rawData.data || !Array.isArray(rawData.data.artworks)) return []

  const artworksResult: ArtworksProcessorResult = {
    artworks: rawData.data.artworks.map((artwork) => {
      const artworkTypeName = getTypeName(artwork.type, recordType)
      return {
        entityId: anime_id,
        entityType: 'anime',
        mediaType: artworkTypeName,
        src: artwork.image,
        size: 'default',
      }
    }),
  }

  return artworksResult
}
