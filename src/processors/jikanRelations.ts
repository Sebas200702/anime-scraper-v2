import type {
  NewMedia,
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
import { mapAnime } from './jikan/animeMapper.js'
export const processAnimeDetails = (
  rawData: JikanAnimeFullResponse,
  task: ScrapingTask
) => {
  const animeData = rawData.data
  const { animeId } = task.payload as { animeId: number }

  const animeRelationResult: AnimeRelationsProcessorResult = {
    // La ficha completa es la única fuente que actualiza la fila `anime` sin
    // re-barrido (Modo B). El mapper reutiliza el del listado y añade la
    // cobertura que `/full` sí trae (broadcast, aired, stats, tráiler).
    anime: mapAnime(animeData as unknown as Parameters<typeof mapAnime>[0])
      .anime,
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
    characterVoiceActors: data.flatMap((item) =>
      (item.voice_actors || []).map((va) => ({
        characterId: item.character.mal_id,
        staffId: va.person.mal_id,
        language: va.language || 'Unknown',
      }))
    ),
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
      const mediaList: NewMedia[] = []
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
