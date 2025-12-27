import type {
  AnimeCharactersProcessorResult,
  AnimeRelationsProcessorResult,
  AnimeStaffProcessorResult,
  ScrapingTask,
} from '../types/index.js'
import type {
  JikanAnimeFullResponse,
  JikanAnimeCharactersResponse,
  JikanAnimeStaffResponse,
} from 'types/jikanDetailsApi.js'
export const processAnimeDetails = (
  rawData: JikanAnimeFullResponse,
  task: ScrapingTask
) => {
  const animeData = rawData.data
  const { animeId } = task.payload as { animeId: number }

  const animeRelationResult: AnimeRelationsProcessorResult = {
    animeGenres: animeData.genres.map((genre) => ({
      animeId: animeId,
      genreId: genre.mal_id,
    })),
    animeDemographics: animeData.demographics.map((demographic) => ({
      animeId: animeId,
      demographicId: demographic.mal_id,
    })),
    animeThemes: animeData.themes.map((theme) => ({
      animeId: animeId,
      themeId: theme.mal_id,
    })),
    animeProducers: animeData.producers.map((producer) => ({
      animeId: animeId,
      producerId: producer.mal_id,
    })),
    animeRelatedAnime: animeData.relations.flatMap((relatedAnime) =>
      relatedAnime.entry.map((entry) => ({
        animeId: animeId,
        relatedAnimeId: entry.mal_id,
        relationType: relatedAnime.relation ?? 'Other',
      }))
    ),

    animeMedias: (() => {
      const animeMedia = []
      if (animeData.trailer)
        animeMedia.push({
          entityType: 'anime',
          mediaType: 'trailer',
          src: animeData.trailer.url || '',
          size: 'default',
          entityId: animeId,
        })
      if (animeData.images.webp) {
        animeMedia.push(
          {
            entityId: animeId,
            entityType: 'anime',
            mediaType: 'poster',
            src: animeData.images.webp.large_image_url || '',
            size: 'large',
          },
          {
            entityId: animeId,
            entityType: 'anime',
            mediaType: 'poster',
            src: animeData.images.webp.image_url || '',
            size: 'default',
          },
          {
            entityId: animeId,
            entityType: 'anime',
            mediaType: 'poster',
            src: animeData.images.webp.small_image_url || '',
            size: 'small',
          }
        )
      } else if (animeData.images.jpg) {
        animeMedia.push(
          {
            entityId: animeId,
            entityType: 'anime',
            mediaType: 'poster',
            src: animeData.images.jpg.large_image_url || '',
            size: 'large',
          },
          {
            entityId: animeId,
            entityType: 'anime',
            mediaType: 'poster',
            src: animeData.images.jpg.image_url || '',
            size: 'default',
          },
          {
            entityId: animeId,
            entityType: 'anime',
            mediaType: 'poster',
            src: animeData.images.jpg.small_image_url || '',
            size: 'small',
          }
        )
      }
      return animeMedia
    })(),
  }
  return animeRelationResult
}

export const processAnimeCharacters = (
  rawData: JikanAnimeCharactersResponse,
  task: ScrapingTask
) => {
  const data = rawData.data
  const { animeId } = task.payload as { animeId: number }
  const animeCharactersResult: AnimeCharactersProcessorResult = {
    animeCharacters: data.map((item) => ({
      animeId: animeId,
      characterId: item.character.mal_id,
      role: item.role || 'Unknown',
    })),
    characterMedia: data.flatMap((item) => {
      const mediaList = []
      if (item.character.images.webp) {
        mediaList.push({
          entityId: item.character.mal_id,
          entityType: 'character',
          mediaType: 'picture',
          src: item.character.images.webp.image_url || '',
          size: 'default',
        })
      } else if (item.character.images.jpg) {
        mediaList.push({
          entityId: item.character.mal_id,
          entityType: 'character',
          mediaType: 'picture',
          src: item.character.images.jpg.image_url || '',
          size: 'default',
        })
      }
      return mediaList
    }),
  }
  return animeCharactersResult
}

export const processAnimeStaff = (
  rawData: JikanAnimeStaffResponse,
  task: ScrapingTask
) => {
  const data = rawData.data
  const { animeId } = task.payload as { animeId: number }
  const animeStaffResult: AnimeStaffProcessorResult = {
    animeStaffs: data.map((item) => ({
      animeId: animeId,
      staffId: item.person.mal_id,
      role: item.positions.join(', ') ?? 'Unkwnown',
    })),
    staffMedia: data.flatMap((item) => {
      const mediaList = []
      if (item.person.images.jpg) {
        mediaList.push({
          entityId: item.person.mal_id,
          entityType: 'staff',
          mediaType: 'picture',
          src: item.person.images.jpg.image_url || '',
          size: 'default',
        })
      }
      return mediaList
    }),
  }
  return animeStaffResult
}
