import { anime, animeTitleSynonym } from '../schemas/anime.js'
import { unique } from '../utils/deduplicate.js'
import { demographic, genre, theme } from '../schemas/animeTaxonomy.js'
import { normalizeText } from '../utils/normalize.js'
import { character, characterNickname } from '../schemas/character.js'
import { staff, staffAlternativeName } from '../schemas/staff.js'
import { db } from '../libs/db.js'
import { inArray } from 'drizzle-orm'
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
import { media } from '@schemas/media.js'

export const jikanRepository = {
  async upsertAnimeBatch(animes: NewAnime[]): Promise<number> {
    try {
      if (!animes || animes.length === 0) {
        console.log('No animes to upsert in this batch.')
        return 0
      }
      const animeIds = animes.map((a) => a.malId!)
      const existing = await db
        .select({ malId: anime.malId })
        .from(anime)
        .where(inArray(anime.malId, animeIds))
      const existingIds = new Set(existing.map((e) => e.malId))
      const newAnimes = animes.filter((a) => !existingIds.has(a.malId!))
      if (newAnimes.length === 0) {
        console.log('No new animes to insert in this batch.')
        return 0
      }
      await db.insert(anime).values(newAnimes)

      return newAnimes.length
    } catch (e) {
      console.error('Failed to upsert anime batch:', e)
      return 0
    }
  },
  async upsertAnimeTitleSynonymBatch(
    titleSynonyms: NewAnimeTitleSynonym[]
  ): Promise<number> {
    try {
      if (!titleSynonyms || titleSynonyms.length === 0) {
        console.log('No anime title synonyms to upsert in this batch.')
        return 0
      }
      await db
        .insert(animeTitleSynonym)
        .values(titleSynonyms)
        .onConflictDoNothing()
      return titleSynonyms.length
    } catch (e) {
      console.error('Failed to upsert anime title synonym batch:', e)
      return 0
    }
  },
  async upsertGenreBatch(genres: NewGenre[]): Promise<number> {
    try {
      if (!genres || genres.length === 0) {
        console.log('No genres to upsert in this batch.')
        return 0
      }
      const existingGenres = await db
        .select({ malId: genre.malId })
        .from(genre)
        .where(
          inArray(
            genre.malId,
            genres.map((g) => g.malId!)
          )
        )
      const existingGenreIds = new Set(existingGenres.map((g) => g.malId))
      const newGenres = genres.filter((g) => !existingGenreIds.has(g.malId!))
      if (newGenres.length === 0) {
        console.log('No new genres to insert in this batch.')
        return 0
      }
      await db.insert(genre).values(newGenres).onConflictDoNothing()

      return newGenres.length
    } catch (e) {
      console.error('Failed to upsert genre batch:', e)
      return 0
    }
  },
  async upsertDemographicBatch(
    demographics: NewDemographic[]
  ): Promise<number> {
    try {
      if (!demographics || demographics.length === 0) {
        console.log('No demographics to upsert in this batch.')
        return 0
      }
      const existingDemographics = await db
        .select({ malId: demographic.malId })
        .from(demographic)
        .where(
          inArray(
            demographic.malId,
            demographics.map((d) => d.malId!)
          )
        )
      const existingDemographicIds = new Set(
        existingDemographics.map((d) => d.malId)
      )
      const newDemographics = demographics.filter(
        (d) => !existingDemographicIds.has(d.malId!)
      )

      if (newDemographics.length === 0) {
        console.log('No new demographics to insert in this batch.')
        return 0
      }
      await db.insert(demographic).values(newDemographics).onConflictDoNothing()

      return demographics.length
    } catch (e) {
      console.error('Failed to upsert demographic batch:', e)
      return 0
    }
  },
  async upsertThemeBatch(themes: NewTheme[]): Promise<number> {
    try {
      if (!themes || themes.length === 0) {
        console.log('No themes to upsert in this batch.')
        return 0
      }
      const existingThemes = await db
        .select({ malId: theme.malId })
        .from(theme)
        .where(
          inArray(
            theme.malId,
            themes.map((t) => t.malId!)
          )
        )
      const existingThemeIds = new Set(existingThemes.map((t) => t.malId))
      const newThemes = themes.filter((t) => !existingThemeIds.has(t.malId!))
      if (newThemes.length === 0) {
        console.log('No new themes to insert in this batch.')
        return 0
      }
      await db.insert(theme).values(newThemes).onConflictDoNothing()

      return newThemes.length
    } catch (e) {
      console.error('Failed to upsert theme batch:', e)
      return 0
    }
  },
  async upsertCharacterBatch(characters: NewCharacter[]): Promise<number> {
    try {
      if (!characters || characters.length === 0) {
        console.log('No characters to upsert in this batch.')
        return 0
      }
      const characterIds = characters.map((c) => c.malId!)
      const existingCharacters = await db
        .select({ malId: character.malId })
        .from(character)
        .where(inArray(character.malId, characterIds))

      const existingCharacterIds = new Set(
        existingCharacters.map((c) => c.malId)
      )
      const newCharacters = characters.filter(
        (c) => !existingCharacterIds.has(c.malId!)
      )
      if (newCharacters.length === 0) {
        console.log('No new characters to insert in this batch.')
        return 0
      }
      await db.insert(character).values(newCharacters).onConflictDoNothing()

      return newCharacters.length
    } catch (e) {
      console.error('Failed to upsert character batch:', e)
      return 0
    }
  },
  async upsertStaffBatch(staffs: NewStaff[]): Promise<number> {
    try {
      if (!staffs || staffs.length === 0) {
        console.log('No staff to upsert in this batch.')
        return 0
      }
      const staffIds = staffs.map((s) => s.malId!)
      const existingStaff = await db
        .select({ malId: staff.malId })
        .from(staff)
        .where(inArray(staff.malId, staffIds))

      const existingStaffIds = new Set(existingStaff.map((s) => s.malId))
      const newStaffs = staffs.filter((s) => !existingStaffIds.has(s.malId!))
      if (newStaffs.length === 0) {
        console.log('No new staff to insert in this batch.')
        return 0
      }

      await db.insert(staff).values(newStaffs)

      return newStaffs.length
    } catch (e) {
      console.error('Failed to upsert staff batch:', e)
      return 0
    }
  },
  async upsertStaffAlternativeNamesBatch(
    staffAlternativeNames: NewStaffAlternativeName[]
  ): Promise<number> {
    try {
      if (!staffAlternativeNames || staffAlternativeNames.length === 0) {
        console.log('No staff alternative names to upsert in this batch.')
        return 0
      }
      const existingNames = await db
        .select({
          staffId: staffAlternativeName.staffId,
          name: staffAlternativeName.name,
        })
        .from(staffAlternativeName)
        .where(
          inArray(
            staffAlternativeName.staffId,
            staffAlternativeNames.map((s) => s.staffId)
          )
        )

      const existingSet = new Set(
        existingNames.map((e) => `${e.staffId}:${normalizeText(e.name)}`)
      )
      const newStaffAlternativeNames = staffAlternativeNames.filter(
        (s) => !existingSet.has(`${s.staffId}:${normalizeText(s.name)}`)
      )

      if (newStaffAlternativeNames.length === 0) {
        console.log('No new staff alternative names to insert in this batch.')
        return 0
      }

      await db.insert(staffAlternativeName).values(newStaffAlternativeNames)

      return newStaffAlternativeNames.length
    } catch (e) {
      console.error('Failed to upsert staff alternative names batch:', e)
      return 0
    }
  },
  async upsertCharacterNicknamesBatch(
    nicknames: NewCharacterNickname[]
  ): Promise<number> {
    try {
      if (!nicknames || nicknames.length === 0) {
        console.log('No character nicknames to upsert in this batch.')
        return 0
      }

      const existingNicknames = await db
        .select({
          characterId: characterNickname.characterId,
          nickname: characterNickname.nickname,
        })
        .from(characterNickname)
        .where(
          inArray(
            characterNickname.characterId,
            nicknames.map((n) => n.characterId)
          )
        )
      const existingSet = new Set(
        existingNicknames.map(
          (e) => `${e.characterId}:${normalizeText(e.nickname)}`
        )
      )
      const newNicknames = nicknames.filter(
        (n) => !existingSet.has(`${n.characterId}:${normalizeText(n.nickname)}`)
      )
      if (newNicknames.length === 0) {
        console.log('No new character nicknames to insert in this batch.')
        return 0
      }
      await db.insert(characterNickname).values(newNicknames)
      return newNicknames.length
    } catch (e) {
      console.error('Failed to upsert character nicknames batch:', e)
      return 0
    }
  },
  async upsertProducerBatch(producers: NewProducer[]): Promise<number> {
    try {
      const existingProducers = await db
        .select({ malId: producer.malId })
        .from(producer)
        .where(
          inArray(
            producer.malId,
            producers.map((p) => p.malId!)
          )
        )
      const existingProducerIds = new Set(existingProducers.map((p) => p.malId))
      const newProducers = producers.filter(
        (p) => !existingProducerIds.has(p.malId!)
      )
      if (newProducers.length === 0) {
        console.log('No new producers to insert in this batch.')
        return 0
      }
      await db.insert(producer).values(newProducers).onConflictDoNothing()
      return newProducers.length
    } catch (e) {
      console.error('Failed to upsert producer batch:', e)
      return 0
    }
  },
  async upsertAnimeMediaBatch(relations: NewMedia[]): Promise<number> {
    const exixtingMedia = await db
      .select({
        entityId: media.entityId,
        mediaType: media.mediaType,
        size: media.size,
        src: media.src,
      })
      .from(media)
      .where(
        inArray(
          media.entityId,
          relations.map((r) => r.entityId)
        )
      )
    const existingSet = new Set(
      exixtingMedia.map(
        (em) => `${em.entityId}:${em.mediaType}:${em.size}:${em.src}`
      )
    )
    const newRelations = relations.filter(
      (r) => !existingSet.has(`${r.entityId}:${r.mediaType}:${r.size}:${r.src}`)
    )
    try {
      await db.insert(media).values(newRelations).onConflictDoNothing()
      return newRelations.length
    } catch (e) {
      console.error('Failed to upsert anime media batch:', e)
      return 0
    }
  },
  async upsertCharacterMediaBatch(relations: NewMedia[]): Promise<number> {
    const existingCharactersMedia = await db
      .select({
        entityId: media.entityId,
        mediaType: media.mediaType,
        size: media.size,
        src: media.src,
      })
      .from(media)
      .where(
        inArray(
          media.entityId,
          relations.map((r) => r.entityId)
        )
      )
    const existingSet = new Set(
      existingCharactersMedia.map(
        (em) => `${em.entityId}:${em.mediaType}:${em.size}:${em.src}`
      )
    )
    const newRelations = relations.filter(
      (r) => !existingSet.has(`${r.entityId}:${r.mediaType}:${r.size}:${r.src}`)
    )

    try {
      await db.insert(media).values(newRelations).onConflictDoNothing()
      return newRelations.length
    } catch (e) {
      console.error('Failed to upsert character media batch:', e)
      return 0
    }
  },
  async upsertProducerTitlesBatch(
    producerTitles: NewProducerTitle[]
  ): Promise<number> {
    try {
      const existingTitles = await db
        .select({
          producerId: producerTitle.producerId,
          title: producerTitle.title,
        })
        .from(producerTitle)
        .where(
          inArray(
            producerTitle.producerId,
            producerTitles.map((t) => t.producerId)
          )
        )
      const existingSet = new Set(
        existingTitles.map((e) => `${e.producerId}:${normalizeText(e.title)}`)
      )
      const newProducerTitles = producerTitles.filter(
        (t) => !existingSet.has(`${t.producerId}:${normalizeText(t.title)}`)
      )
      if (newProducerTitles.length === 0) {
        console.log('No new producer titles to insert in this batch.')
        return 0
      }
      await db
        .insert(producerTitle)
        .values(newProducerTitles)
        .onConflictDoNothing()
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

    await this.upsertAnimeBatch(uniqueAnimes)
    await this.upsertGenreBatch(uniqueGenres)
    await this.upsertDemographicBatch(uniqueDemographics)
    await this.upsertThemeBatch(uniqueThemes)
    await this.upsertAnimeTitleSynonymBatch(uniqueTitleSynonyms)
    await this.upsertAnimeMediaBatch(uniqueAnimeMedia)

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

    await this.upsertCharacterBatch(uniqueCharacters)
    await this.upsertCharacterNicknamesBatch(uniqueNicknames)
    await this.upsertCharacterMediaBatch(uniqueCharacterMedia)
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
