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

    titleSynonyms: (anime.title_synonyms || []).map((title) => ({
      animeId: anime.mal_id,
      title,
    })),
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
