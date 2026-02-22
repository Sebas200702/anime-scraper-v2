import { media } from '../schemas/media.js'
import { db } from '../libs/db.js'
import {
  animeCharacter,
  animeDemographic,
  animeGenre,
  animeProducer,
  animeRelatedAnime,
  animeStaff,
  animeTheme,
} from '../schemas/animeRelations.js'
import type {
  AnimeCharactersProcessorResult,
  AnimeRelationsProcessorResult,
  AnimeStaffProcessorResult,
  NewAnimeCharacter,
  NewAnimeDemographic,
  NewAnimeGenre,
  NewAnimeProducer,
  NewAnimeRelatedAnime,
  NewAnimeStaff,
  NewAnimeTheme,
  NewCharacterVoiceActor,
  NewMedia,
} from '../types/index.js'

import { unique } from '../utils/deduplicate.js'
import { staff } from '../schemas/staff.js'
import { inArray } from 'drizzle-orm/sql/expressions/conditions'
import { character } from '../schemas/character.js'
import { anime } from '../schemas/anime.js'
import { characterVoiceActor } from '../schemas/characterRelations.js'
import { chunk, SQLITE_MAX_VARIABLES } from '../utils/chunk.js'

export const jikanRelationsRepository = {
  async upsertAnimeGenresBatch(relations: NewAnimeGenre[]): Promise<number> {
    try {
      if (!relations || relations.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 2)
      await db.transaction(async (tx) => {
        for (const batch of chunk(relations, batchSize)) {
          await tx.insert(animeGenre).values(batch).onConflictDoNothing()
        }
      })
      return relations.length
    } catch (e) {
      console.error('Failed to upsert anime genres batch:', e)
      return 0
    }
  },

  async upsertAnimeThemesBatch(relations: NewAnimeTheme[]): Promise<number> {
    try {
      if (!relations || relations.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 2)
      await db.transaction(async (tx) => {
        for (const batch of chunk(relations, batchSize)) {
          await tx.insert(animeTheme).values(batch).onConflictDoNothing()
        }
      })
      return relations.length
    } catch (e) {
      console.error('Failed to upsert anime themes batch:', e)
      return 0
    }
  },
  async upsertAnimeDemographicsBatch(
    relations: NewAnimeDemographic[]
  ): Promise<number> {
    try {
      if (!relations || relations.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 2)
      await db.transaction(async (tx) => {
        for (const batch of chunk(relations, batchSize)) {
          await tx.insert(animeDemographic).values(batch).onConflictDoNothing()
        }
      })
      return relations.length
    } catch (e) {
      console.error('Failed to upsert anime demographics batch:', e)
      return 0
    }
  },

  async upsertAnimeProducersBatch(
    relations: NewAnimeProducer[]
  ): Promise<number> {
    try {
      if (!relations || relations.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 2)
      await db.transaction(async (tx) => {
        for (const batch of chunk(relations, batchSize)) {
          await tx.insert(animeProducer).values(batch).onConflictDoNothing()
        }
      })
      return relations.length
    } catch (e) {
      console.error('Failed to upsert anime producers batch:', e)
      return 0
    }
  },
  async upsertAnimeRelatedAnimeBatch(
    relations: NewAnimeRelatedAnime[]
  ): Promise<number> {
    if (relations.length === 0) return 0

    try {
      // 1. relatedAnimeIds únicos
      const relatedIds = [...new Set(relations.map((r) => r.relatedAnimeId))]

      // 2. Animes existentes (solo related)
      let validRelatedIds = new Set<number>()
      for (const batch of chunk(relatedIds, SQLITE_MAX_VARIABLES)) {
        const existing = await db
          .select({ id: anime.malId })
          .from(anime)
          .where(inArray(anime.malId, batch))
        for (const a of existing) validRelatedIds.add(a.id)
      }

      // 3. Filtrar relaciones inválidas
      const validRelations = relations.filter((r) =>
        validRelatedIds.has(r.relatedAnimeId)
      )

      if (validRelations.length === 0) return 0

      // 4. Insertar solo los válidos
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 4)
      await db.transaction(async (tx) => {
        for (const batch of chunk(validRelations, batchSize)) {
          await tx.insert(animeRelatedAnime).values(batch).onConflictDoNothing()
        }
      })

      return validRelations.length
    } catch (e) {
      console.error('Failed to upsert anime related anime batch:', e)
      return 0
    }
  },
  async upsertAnimeCharactersBatch(
    relations: NewAnimeCharacter[]
  ): Promise<number> {
    if (relations.length === 0) return 0

    try {
      // 1. IDs únicos de characters
      const characterIds = [...new Set(relations.map((r) => r.characterId))]

      // 2. Characters existentes
      let validCharacterIds = new Set<number>()
      for (const batch of chunk(characterIds, SQLITE_MAX_VARIABLES)) {
        const existing = await db
          .select({ id: character.malId })
          .from(character)
          .where(inArray(character.malId, batch))
        for (const c of existing) validCharacterIds.add(c.id)
      }

      // 3. Filtrar relaciones inválidas
      const validRelations = relations.filter((r) =>
        validCharacterIds.has(r.characterId)
      )

      if (validRelations.length === 0) return 0

      // 4. Insertar solo las válidas
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 3)
      await db.transaction(async (tx) => {
        for (const batch of chunk(validRelations, batchSize)) {
          await tx.insert(animeCharacter).values(batch).onConflictDoNothing()
        }
      })

      return validRelations.length
    } catch (e) {
      console.error('Failed to upsert anime characters batch:', e)
      return 0
    }
  },

  async upsertAnimeStaffBatch(relations: NewAnimeStaff[]): Promise<number> {
    if (relations.length === 0) return 0

    try {
      // 1. staffIds únicos del batch
      const staffIds = [...new Set(relations.map((r) => r.staffId))]

      // 2. staff existentes
      let validStaffIds = new Set<number>()
      for (const batch of chunk(staffIds, SQLITE_MAX_VARIABLES)) {
        const existing = await db
          .select({ id: staff.malId })
          .from(staff)
          .where(inArray(staff.malId, batch))
        for (const s of existing) validStaffIds.add(s.id)
      }

      // 3. filtrar relaciones inválidas
      const validRelations = relations.filter((r) =>
        validStaffIds.has(r.staffId)
      )

      if (validRelations.length === 0) return 0

      // 4. insertar solo las válidas
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 3)
      await db.transaction(async (tx) => {
        for (const batch of chunk(validRelations, batchSize)) {
          await tx
            .insert(animeStaff)
            .values(
              batch.map(({ animeId, staffId, role }) => ({
                animeId,
                staffId,
                role,
              }))
            )
            .onConflictDoNothing()
        }
      })

      return validRelations.length
    } catch (e) {
      console.error('Failed to upsert anime staff batch:', e)
      return 0
    }
  },
  async upsertCharacterVoiceActorsBatch(
    relations: NewCharacterVoiceActor[]
  ): Promise<number> {
    try {
      if (!relations || relations.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 3)
      await db.transaction(async (tx) => {
        for (const batch of chunk(relations, batchSize)) {
          await tx
            .insert(characterVoiceActor)
            .values(batch)
            .onConflictDoNothing()
        }
      })
      return relations.length
    } catch (e) {
      console.error('Failed to upsert character voice actors batch:', e)
      return 0
    }
  },

  async upsertStaffMediaBatch(relations: NewMedia[]): Promise<number> {
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
      console.error('Failed to upsert staff media batch:', e)
      return 0
    }
  },

  async saveAnimeDetails(
    animeDetailsResults: AnimeRelationsProcessorResult[]
  ): Promise<number> {
    const genreRelations: NewAnimeGenre[] = []
    const themeRelations: NewAnimeTheme[] = []
    const demographicRelations: NewAnimeDemographic[] = []
    const producerRelations: NewAnimeProducer[] = []
    const relatedAnimeRelations: NewAnimeRelatedAnime[] = []

    for (const result of animeDetailsResults) {
      if (result.animeGenres) genreRelations.push(...result.animeGenres)
      if (result.animeThemes) themeRelations.push(...result.animeThemes)
      if (result.animeDemographics)
        demographicRelations.push(...result.animeDemographics)
      if (result.animeProducers)
        producerRelations.push(...result.animeProducers)
      if (result.animeRelatedAnime)
        relatedAnimeRelations.push(...result.animeRelatedAnime)
    }

    const uniqueGenreRelations = unique(
      genreRelations,
      (g) => g.animeId + ':' + g.genreId
    )
    const uniqueThemeRelations = unique(
      themeRelations,
      (t) => t.animeId + ':' + t.themeId
    )
    const uniqueDemographicRelations = unique(
      demographicRelations,
      (d) => d.animeId + ':' + d.demographicId
    )
    const uniqueProducerRelations = unique(
      producerRelations,
      (p) => p.animeId + ':' + p.producerId
    )
    const uniqueRelatedAnimeRelations = unique(
      relatedAnimeRelations,
      (r) => r.animeId + ':' + r.relatedAnimeId + ':' + r.relationType
    )

    // All relation inserts in parallel — anime already exists as FK target
    await Promise.all([
      this.upsertAnimeGenresBatch(uniqueGenreRelations),
      this.upsertAnimeThemesBatch(uniqueThemeRelations),
      this.upsertAnimeDemographicsBatch(uniqueDemographicRelations),
      this.upsertAnimeProducersBatch(uniqueProducerRelations),
      this.upsertAnimeRelatedAnimeBatch(uniqueRelatedAnimeRelations),
    ])

    return (
      uniqueGenreRelations.length +
      uniqueThemeRelations.length +
      uniqueDemographicRelations.length +
      uniqueProducerRelations.length +
      uniqueRelatedAnimeRelations.length
    )
  },
  async saveAnimeCharacters(
    animeCharactersResults: AnimeCharactersProcessorResult[]
  ): Promise<number> {
    const characterRelations: NewAnimeCharacter[] = []
    const characterVoiceActors: NewCharacterVoiceActor[] = []

    for (const result of animeCharactersResults) {
      characterRelations.push(...result.animeCharacters)

      characterVoiceActors.push(...result.characterVoiceActors)
    }
    const uniqueCharacterRelations = unique(
      characterRelations,
      (c) => c.animeId + ':' + c.characterId + ':' + c.role
    )

    const uniqueCharacterVoiceActors = unique(
      characterVoiceActors,
      (s) => s.characterId + ':' + s.staffId + ':' + s.language
    )
    // Both inserts in parallel — no FK dependency between them
    await Promise.all([
      this.upsertAnimeCharactersBatch(uniqueCharacterRelations),
      this.upsertCharacterVoiceActorsBatch(uniqueCharacterVoiceActors),
    ])

    return uniqueCharacterRelations.length + uniqueCharacterVoiceActors.length
  },
  async saveAnimeStaff(
    animeStaffResults: AnimeStaffProcessorResult[]
  ): Promise<number> {
    const staffRelations: NewAnimeStaff[] = []
    const staffMedia: NewMedia[] = []
    for (const result of animeStaffResults) {
      staffRelations.push(...result.animeStaffs)
      staffMedia.push(...result.staffMedia)
    }
    const uniqueStaffRelations = unique(
      staffRelations,
      (s) => s.animeId + ':' + s.staffId + ':' + s.role
    )
    const uniqueStaffMedia = unique(
      staffMedia,
      (m) => m.entityId + ':' + m.mediaType + ':' + m.size + ':' + m.src
    )
    // Both inserts in parallel — independent tables
    await Promise.all([
      this.upsertAnimeStaffBatch(uniqueStaffRelations),
      this.upsertStaffMediaBatch(uniqueStaffMedia),
    ])

    return uniqueStaffRelations.length + uniqueStaffMedia.length
  },
}
