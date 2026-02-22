import { anime, animeTitleSynonym } from '../schemas/anime.js'
import { unique } from '../utils/deduplicate.js'
import { demographic, genre, theme } from '../schemas/animeTaxonomy.js'
import { normalizeText } from '../utils/normalize.js'
import { character, characterNickname } from '../schemas/character.js'
import { staff, staffAlternativeName } from '../schemas/staff.js'
import { db } from '../libs/db.js'
import type {
  AnimeProcessorResult,
  NewAnime,
  NewCharacter,
  NewDemographic,
  NewGenre,
  NewStaff,
  NewTheme,
  CharacterProcessorResult,
  NewCharacterNickname,
  StaffProcessorResult,
  NewStaffAlternativeName,
  NewProducer,
  NewProducerTitle,
  ProducerProcessorResult,
  NewAnimeTitleSynonym,
  NewMedia,
} from '../types/index.js'
import { producer, producerTitle } from '../schemas/producer.js'
import { media } from '../schemas/media.js'
import { chunk, SQLITE_MAX_VARIABLES } from '../utils/chunk.js'

export const jikanRepository = {
  async upsertAnimeBatch(animes: NewAnime[]): Promise<number> {
    try {
      if (!animes || animes.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 15)
      await db.transaction(async (tx) => {
        for (const batch of chunk(animes, batchSize)) {
          await tx.insert(anime).values(batch).onConflictDoNothing()
        }
      })
      return animes.length
    } catch (e) {
      console.error('Failed to upsert anime batch:', e)
      return 0
    }
  },
  async upsertAnimeTitleSynonymBatch(
    titleSynonyms: NewAnimeTitleSynonym[]
  ): Promise<number> {
    try {
      if (!titleSynonyms || titleSynonyms.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 3)
      await db.transaction(async (tx) => {
        for (const batch of chunk(titleSynonyms, batchSize)) {
          await tx.insert(animeTitleSynonym).values(batch).onConflictDoNothing()
        }
      })
      return titleSynonyms.length
    } catch (e) {
      console.error('Failed to upsert anime title synonym batch:', e)
      return 0
    }
  },
  async upsertGenreBatch(genres: NewGenre[]): Promise<number> {
    try {
      if (!genres || genres.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 3)
      await db.transaction(async (tx) => {
        for (const batch of chunk(genres, batchSize)) {
          await tx.insert(genre).values(batch).onConflictDoNothing()
        }
      })
      return genres.length
    } catch (e) {
      console.error('Failed to upsert genre batch:', e)
      return 0
    }
  },
  async upsertDemographicBatch(
    demographics: NewDemographic[]
  ): Promise<number> {
    try {
      if (!demographics || demographics.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 3)
      await db.transaction(async (tx) => {
        for (const batch of chunk(demographics, batchSize)) {
          await tx.insert(demographic).values(batch).onConflictDoNothing()
        }
      })
      return demographics.length
    } catch (e) {
      console.error('Failed to upsert demographic batch:', e)
      return 0
    }
  },
  async upsertThemeBatch(themes: NewTheme[]): Promise<number> {
    try {
      if (!themes || themes.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 3)
      await db.transaction(async (tx) => {
        for (const batch of chunk(themes, batchSize)) {
          await tx.insert(theme).values(batch).onConflictDoNothing()
        }
      })
      return themes.length
    } catch (e) {
      console.error('Failed to upsert theme batch:', e)
      return 0
    }
  },
  async upsertCharacterBatch(characters: NewCharacter[]): Promise<number> {
    try {
      if (!characters || characters.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 5)
      await db.transaction(async (tx) => {
        for (const batch of chunk(characters, batchSize)) {
          await tx.insert(character).values(batch).onConflictDoNothing()
        }
      })
      return characters.length
    } catch (e) {
      console.error('Failed to upsert character batch:', e)
      return 0
    }
  },
  async upsertStaffBatch(staffs: NewStaff[]): Promise<number> {
    try {
      if (!staffs || staffs.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 6)
      await db.transaction(async (tx) => {
        for (const batch of chunk(staffs, batchSize)) {
          await tx.insert(staff).values(batch).onConflictDoNothing()
        }
      })
      return staffs.length
    } catch (e) {
      console.error('Failed to upsert staff batch:', e)
      return 0
    }
  },
  async upsertStaffAlternativeNamesBatch(
    staffAlternativeNames: NewStaffAlternativeName[]
  ): Promise<number> {
    try {
      if (!staffAlternativeNames || staffAlternativeNames.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 3)
      await db.transaction(async (tx) => {
        for (const batch of chunk(staffAlternativeNames, batchSize)) {
          await tx
            .insert(staffAlternativeName)
            .values(batch)
            .onConflictDoNothing()
        }
      })
      return staffAlternativeNames.length
    } catch (e) {
      console.error('Failed to upsert staff alternative names batch:', e)
      return 0
    }
  },
  async upsertCharacterNicknamesBatch(
    nicknames: NewCharacterNickname[]
  ): Promise<number> {
    try {
      if (!nicknames || nicknames.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 3)
      await db.transaction(async (tx) => {
        for (const batch of chunk(nicknames, batchSize)) {
          await tx.insert(characterNickname).values(batch).onConflictDoNothing()
        }
      })
      return nicknames.length
    } catch (e) {
      console.error('Failed to upsert character nicknames batch:', e)
      return 0
    }
  },
  async upsertProducerBatch(producers: NewProducer[]): Promise<number> {
    try {
      if (!producers || producers.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 5)
      await db.transaction(async (tx) => {
        for (const batch of chunk(producers, batchSize)) {
          await tx.insert(producer).values(batch).onConflictDoNothing()
        }
      })
      return producers.length
    } catch (e) {
      console.error('Failed to upsert producer batch:', e)
      return 0
    }
  },
  async upsertMediaBatch(relations: NewMedia[]): Promise<number> {
    try {
      if (!relations || relations.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 6)
      await db.transaction(async (tx) => {
        for (const batch of chunk(relations, batchSize)) {
          await tx.insert(media).values(batch).onConflictDoNothing()
        }
      })
      return relations.length
    } catch (e) {
      console.error('Failed to upsert media batch:', e)
      return 0
    }
  },
  async upsertProducerTitlesBatch(
    producerTitles: NewProducerTitle[]
  ): Promise<number> {
    try {
      if (!producerTitles || producerTitles.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 4)
      await db.transaction(async (tx) => {
        for (const batch of chunk(producerTitles, batchSize)) {
          await tx.insert(producerTitle).values(batch).onConflictDoNothing()
        }
      })
      return producerTitles.length
    } catch (e) {
      console.error('Failed to upsert producer titles batch:', e)
      return 0
    }
  },

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

    // 🔑 DEDUPLICACIÓN
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
      (m) => m.entityId + ':' + m.mediaType + ':' + m.size + ':' + m.src
    )

    console.log(
      `Animes received: ${animeResults.length}, Animes processed: ${animes.length}, unique: ${uniqueAnimes.length}`
    )

    // Parent first (FK target), then all children in parallel
    await this.upsertAnimeBatch(uniqueAnimes)
    await Promise.all([
      this.upsertGenreBatch(uniqueGenres),
      this.upsertDemographicBatch(uniqueDemographics),
      this.upsertThemeBatch(uniqueThemes),
      this.upsertAnimeTitleSynonymBatch(uniqueTitleSynonyms),
      this.upsertMediaBatch(uniqueAnimeMedia),
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

    // 🔑 DEDUPLICACIÓN
    const uniqueCharacters = unique(characters, (c) => c.malId)
    const uniqueNicknames = unique(
      nicknames,
      (n) => `${n.characterId}:${normalizeText(n.nickname)}`
    )
    const uniqueCharacterMedia = unique(
      characterMedia,
      (m) => m.entityId + ':' + m.mediaType + ':' + m.size + ':' + m.src
    )

    console.log(
      `Characters received: ${characterResults.length}, CharacterProcessed:${characters.length} unique: ${uniqueCharacters.length}`
    )

    // Parent first (FK target), then children in parallel
    await this.upsertCharacterBatch(uniqueCharacters)
    await Promise.all([
      this.upsertCharacterNicknamesBatch(uniqueNicknames),
      this.upsertMediaBatch(uniqueCharacterMedia),
    ])
    console.log(
      `Saved ${uniqueCharacters.length} characters of ${characterResults.length} results`
    )
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

    // 🔑 DEDUPLICACIÓN
    const uniqueStaffs = unique(staffs, (s) => s.malId)
    const uniqueAlternativeNames = unique(
      alternativeNames,
      (a) => `${a.staffId}:${normalizeText(a.name)}`
    )

    console.log(
      `Staff received: ${staffResults.length}, Staff processed: ${staffs.length}, unique: ${uniqueStaffs.length}`
    )

    await this.upsertStaffBatch(uniqueStaffs)
    await this.upsertStaffAlternativeNamesBatch(uniqueAlternativeNames)
    console.log(
      `Saved ${uniqueStaffs.length} staff of ${staffResults.length} results`
    )
    return uniqueStaffs.length
  },
  async saveProducer(producersResult: ProducerProcessorResult[]) {
    const producers: NewProducer[] = []
    const producerTitles: NewProducerTitle[] = []

    for (const result of producersResult) {
      if (result.producer) producers.push(result.producer)
      if (result.titles?.length) producerTitles.push(...result.titles)
    }
    // 🔑 DEDUPLICACIÓN
    const uniqueProducers = unique(producers, (p) => p.malId)
    const uniqueProducerTitles = unique(
      producerTitles,
      (t) => `${t.producerId}:${normalizeText(t.title)}`
    )
    console.log(
      `Producers received: ${producers.length}, unique: ${uniqueProducers.length}`
    )
    await this.upsertProducerBatch(uniqueProducers)
    await this.upsertProducerTitlesBatch(uniqueProducerTitles)
    console.log(
      `Saved ${uniqueProducers.length} producers of ${producersResult.length} results`
    )
    return uniqueProducers.length
  },
}
