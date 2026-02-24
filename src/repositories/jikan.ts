import { anime, animeTitleSynonym } from '../schemas/anime.js'
import { demographic, genre, theme } from '../schemas/animeTaxonomy.js'
import { character, characterNickname } from '../schemas/character.js'
import { staff, staffAlternativeName } from '../schemas/staff.js'
import { producer, producerTitle } from '../schemas/producer.js'
import { media } from '../schemas/media.js'
import { unique } from '../utils/deduplicate.js'
import { normalizeText } from '../utils/normalize.js'
import { batchUpsert } from '../shared/batchUpsert.js'
import type {
  AnimeProcessorResult,
  CharacterProcessorResult,
  StaffProcessorResult,
  ProducerProcessorResult,
  NewAnime,
  NewGenre,
  NewDemographic,
  NewTheme,
  NewAnimeTitleSynonym,
  NewMedia,
  NewCharacter,
  NewCharacterNickname,
  NewStaff,
  NewStaffAlternativeName,
  NewProducer,
  NewProducerTitle,
} from '../types/index.js'

export const jikanRepository = {
  async saveAnime(animeResults: AnimeProcessorResult[]) {
    const animes: NewAnime[] = []
    const genres: NewGenre[] = []
    const demographics: NewDemographic[] = []
    const themes: NewTheme[] = []
    const titleSynonyms: NewAnimeTitleSynonym[] = []
    const animeMedia: NewMedia[] = []

    for (const result of animeResults) {
      if (result.anime) animes.push(result.anime)
      if (result.genres?.length) genres.push(...result.genres)
      if (result.demographics?.length) demographics.push(...result.demographics)
      if (result.themes?.length) themes.push(...result.themes)
      if (result.titleSynonyms?.length)
        titleSynonyms.push(...result.titleSynonyms)
      if (result.animeMedias?.length) animeMedia.push(...result.animeMedias)
    }

    const uniqueAnimes = unique(animes, (a) => a.malId)
    const uniqueGenres = unique(genres, (g) => g.malId)
    const uniqueDemographics = unique(demographics, (d) => d.malId)
    const uniqueThemes = unique(themes, (t) => t.malId)
    const uniqueTitleSynonyms = unique(
      titleSynonyms,
      (s) => `${s.animeId}:${normalizeText(s.title)}`
    )
    const uniqueAnimeMedia = unique(
      animeMedia,
      (m) => `${m.entityId}:${m.mediaType}:${m.size}:${m.src}`
    )

    console.log(
      `Animes received: ${animeResults.length}, unique: ${uniqueAnimes.length}`
    )

    // Parent first (FK target), then children in parallel
    await batchUpsert(anime, uniqueAnimes, 15, 'anime')
    await Promise.all([
      batchUpsert(genre, uniqueGenres, 3, 'genres'),
      batchUpsert(demographic, uniqueDemographics, 3, 'demographics'),
      batchUpsert(theme, uniqueThemes, 3, 'themes'),
      batchUpsert(animeTitleSynonym, uniqueTitleSynonyms, 3, 'title-synonyms'),
      batchUpsert(media, uniqueAnimeMedia, 6, 'anime-media'),
    ])

    return uniqueAnimes.length
  },

  async saveCharacter(characterResults: CharacterProcessorResult[]) {
    const characters: NewCharacter[] = []
    const nicknames: NewCharacterNickname[] = []
    const characterMedia: NewMedia[] = []

    for (const result of characterResults) {
      if (result.character) characters.push(result.character)
      if (result.nicknames?.length) nicknames.push(...result.nicknames)
      if (result.characterMedia?.length)
        characterMedia.push(...result.characterMedia)
    }

    const uniqueCharacters = unique(characters, (c) => c.malId)
    const uniqueNicknames = unique(
      nicknames,
      (n) => `${n.characterId}:${normalizeText(n.nickname)}`
    )
    const uniqueMedia = unique(
      characterMedia,
      (m) => `${m.entityId}:${m.mediaType}:${m.size}:${m.src}`
    )

    await batchUpsert(character, uniqueCharacters, 5, 'characters')
    await Promise.all([
      batchUpsert(characterNickname, uniqueNicknames, 3, 'nicknames'),
      batchUpsert(media, uniqueMedia, 6, 'character-media'),
    ])

    return uniqueCharacters.length
  },

  async saveStaff(staffResults: StaffProcessorResult[]) {
    const staffs: NewStaff[] = []
    const alternativeNames: NewStaffAlternativeName[] = []

    for (const result of staffResults) {
      if (result.staff) staffs.push(result.staff)
      if (result.alternativeNames?.length)
        alternativeNames.push(...result.alternativeNames)
    }

    const uniqueStaffs = unique(staffs, (s) => s.malId)
    const uniqueAltNames = unique(
      alternativeNames,
      (a) => `${a.staffId}:${normalizeText(a.name)}`
    )

    await batchUpsert(staff, uniqueStaffs, 6, 'staff')
    await batchUpsert(staffAlternativeName, uniqueAltNames, 3, 'staff-alt-names')

    return uniqueStaffs.length
  },

  async saveProducer(producersResult: ProducerProcessorResult[]) {
    const producers: NewProducer[] = []
    const producerTitles: NewProducerTitle[] = []

    for (const result of producersResult) {
      if (result.producer) producers.push(result.producer)
      if (result.titles?.length) producerTitles.push(...result.titles)
    }

    const uniqueProducers = unique(producers, (p) => p.malId)
    const uniqueTitles = unique(
      producerTitles,
      (t) => `${t.producerId}:${normalizeText(t.title)}`
    )

    await batchUpsert(producer, uniqueProducers, 5, 'producers')
    await batchUpsert(producerTitle, uniqueTitles, 4, 'producer-titles')

    return uniqueProducers.length
  },
}
