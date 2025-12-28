import type {
  AnimeProcessorResult,
  CharacterProcessorResult,
  ProducerProcessorResult,
  ScrapingTask,
  StaffProcessorResult,
} from '../types/index.js'
import type {
  JikanResponse,
  Anime,
  Character,
  Producer,
  Staff,
} from '../types/jikanApi.js'

const mapAnime = (anime: Anime) => {
  const animeResult: AnimeProcessorResult = {
    anime: {
      malId: anime.mal_id,
      title: anime.title,
      titleEnglish: anime.title_english,
      titleJapanese: anime.title_japanese,
      type: anime.type,
      status: anime.status,
      episodes: anime.episodes,
      score: anime.score,
      scoredBy: anime.scored_by,
      popularityRank: anime.popularity,
      rating: anime.rating,
      year: anime.year|| anime.aired.prop.from.year,
      season: anime.season,
      synopsis: anime.synopsis,
      background: anime.background,
    },
    titleSynonyms: (anime.title_synonyms || []).map((title) => ({
      animeId: anime.mal_id,
      title,
    })),

    genres: (anime.genres || []).map((g) => ({
      malId: g.mal_id,
      name: g.name,
    })),

    demographics: (anime.demographics || []).map((d) => ({
      malId: d.mal_id,
      name: d.name,
      type: d.type,
    })),

    themes: (anime.themes || []).map((t) => ({
      malId: t.mal_id,
      name: t.name,
      type: t.type,
    })),
    animeMedias: (() => {
      const animeMedia = []
      //si existe src de trailer, agregarlo sino no se agrega

      if (
        anime.trailer.url ||
        anime.trailer.youtube_id ||
        anime.trailer.embed_url
      )
        animeMedia.push({
          entityType: 'anime',
          mediaType: 'trailer',
          src:
            anime.trailer.url ||
            `https://www.youtube.com/watch?v=${anime.trailer.youtube_id}` ||
            anime.trailer.embed_url ||
            '',
          size: 'default',
          entityId: anime.mal_id,
        })
      if (anime.images.webp) {
        animeMedia.push(
          {
            entityId: anime.mal_id,
            entityType: 'anime',
            mediaType: 'poster',
            src: anime.images.webp.large_image_url || '',
            size: 'large',
          },
          {
            entityId: anime.mal_id,
            entityType: 'anime',
            mediaType: 'poster',
            src: anime.images.webp.image_url || '',
            size: 'default',
          },
          {
            entityId: anime.mal_id,
            entityType: 'anime',
            mediaType: 'poster',
            src: anime.images.webp.small_image_url || '',
            size: 'small',
          }
        )
      } else if (anime.images.jpg) {
        animeMedia.push(
          {
            entityId: anime.mal_id,
            entityType: 'anime',
            mediaType: 'poster',
            src: anime.images.jpg.large_image_url || '',
            size: 'large',
          },
          {
            entityId: anime.mal_id,
            entityType: 'anime',
            mediaType: 'poster',
            src: anime.images.jpg.image_url || '',
            size: 'default',
          },
          {
            entityId: anime.mal_id,
            entityType: 'anime',
            mediaType: 'poster',
            src: anime.images.jpg.small_image_url || '',
            size: 'small',
          }
        )
      }
      return animeMedia
    })(),
  }
  return animeResult
}

export const mapCharacter = (character: Character) => {
  const charcaterResult: CharacterProcessorResult = {
    character: {
      malId: character.mal_id,
      name: character.name,
      nameKanji: character.name_kanji,
      about: character.about,
    },

    nicknames: (character.nicknames || []).map((nickname) => ({
      characterId: character.mal_id,
      nickname,
    })),
    characterMedia: (() => {
      const media = []
      if (character.images.webp) {
        media.push({
          entityId: character.mal_id,
          entityType: 'character',
          mediaType: 'picture',
          src: character.images.webp.image_url || '',
          size: 'default',
        })
      } else if (character.images.jpg) {
        media.push({
          entityId: character.mal_id,
          entityType: 'character',
          mediaType: 'picture',
          src: character.images.jpg.image_url || '',
          size: 'default',
        })
      }
      return media
    })(),
  }
  return charcaterResult
}

const mapStaff = (staff: Staff) => {
  const staffResult: StaffProcessorResult = {
    staff: {
      malId: staff.mal_id,
      name: staff.name,
      givenName: staff.given_name,
      familyName: staff.family_name,
      birthday: staff.birthday,
      about: staff.about,
    },

    alternativeNames: (staff.alternate_names || []).map((name) => ({
      staffId: staff.mal_id,
      name,
    })),
  }

  return staffResult
}

const mapProducer = (producer: Producer) => {
  const producerResult: ProducerProcessorResult = {
    producer: {
      malId: producer.mal_id,
      about: producer.about,
      established: producer.established,
      count: producer.count,
    },
    producerMedia: (() => {
      const media = []
      if (producer.images.webp) {
        media.push({
          entityId: producer.mal_id,
          entityType: 'producer',
          mediaType: 'logo',
          src: producer.images.webp.image_url || '',
          size: 'default',
        })
      } else if (producer.images.jpg) {
        media.push({
          entityId: producer.mal_id,
          entityType: 'producer',
          mediaType: 'logo',
          src: producer.images.jpg.image_url || '',
          size: 'default',
        })
      }
      return media
    })(),

    titles: (producer.titles || []).map((t) => ({
      producerId: producer.mal_id,
      type: t.type,
      title: t.title,
    })),
  }
  return producerResult
}

export const processAnime = (
  rawData: JikanResponse<Anime>,
  task: ScrapingTask
) => {
  return (rawData.data || []).map(mapAnime)
}

export const processCharacter = (
  rawData: JikanResponse<Character>,
  task: ScrapingTask
) => {
  return (rawData.data || []).map(mapCharacter)
}

export const processStaff = (
  rawData: JikanResponse<Staff>,
  task: ScrapingTask
) => {
  return (rawData.data || []).map(mapStaff)
}

export const processProducer = (
  rawData: JikanResponse<Producer>,
  task: ScrapingTask
) => {
  return (rawData.data || []).map(mapProducer)
}
