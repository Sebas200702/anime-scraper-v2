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
import { characterVoiceActor } from '@schemas/characterRelations.js'

export const jikanRelationsRepository = {
  async upsertAnimeGenresBatch(relations: NewAnimeGenre[]): Promise<number> {
    const existingAnimeGenres = await db
      .select({
        animeId: animeGenre.animeId,
        genreId: animeGenre.genreId,
      })
      .from(animeGenre)
      .where(
        inArray(
          animeGenre.animeId,
          relations.map((r) => r.animeId)
        )
      )
    const existingSet = new Set(
      existingAnimeGenres.map((eg) => `${eg.animeId}:${eg.genreId}`)
    )
    const newRelations = relations.filter(
      (r) => !existingSet.has(`${r.animeId}:${r.genreId}`)
    )

    if (newRelations.length === 0) {
      console.log('No new anime genre relations to insert.')
      return 0
    }

    try {
      await db.insert(animeGenre).values(newRelations).onConflictDoNothing()

      return newRelations.length
    } catch (e) {
      console.error('Failed to upsert anime genres batch:', e)
      return 0
    }
  },

  async upsertAnimeThemesBatch(relations: NewAnimeTheme[]): Promise<number> {
    const exixtingAnimeThemes = await db
      .select({
        animeId: animeTheme.animeId,
        themeId: animeTheme.themeId,
      })
      .from(animeTheme)
      .where(
        inArray(
          animeTheme.animeId,
          relations.map((r) => r.animeId)
        )
      )
    const existingSet = new Set(
      exixtingAnimeThemes.map((et) => `${et.animeId}:${et.themeId}`)
    )
    const newRelations = relations.filter(
      (r) => !existingSet.has(`${r.animeId}:${r.themeId}`)
    )

    try {
      await db.insert(animeTheme).values(newRelations).onConflictDoNothing()

      return newRelations.length
    } catch (e) {
      console.error('Failed to upsert anime themes batch:', e)
      return 0
    }
  },
  async upsertAnimeDemographicsBatch(
    relations: NewAnimeDemographic[]
  ): Promise<number> {
    const existingAnimeDemographics = await db
      .select({
        animeId: animeDemographic.animeId,
        demographicId: animeDemographic.demographicId,
      })
      .from(animeDemographic)
      .where(
        inArray(
          animeDemographic.animeId,
          relations.map((r) => r.animeId)
        )
      )
    const existingSet = new Set(
      existingAnimeDemographics.map((ed) => `${ed.animeId}:${ed.demographicId}`)
    )
    const newRelations = relations.filter(
      (r) => !existingSet.has(`${r.animeId}:${r.demographicId}`)
    )
    try {
      await db
        .insert(animeDemographic)
        .values(newRelations)
        .onConflictDoNothing()

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
      const existingAnimeProducers = await db
        .select({
          animeId: animeProducer.animeId,
          producerId: animeProducer.producerId,
        })
        .from(animeProducer)
        .where(
          inArray(
            animeProducer.animeId,
            relations.map((r) => r.animeId)
          )
        )
      const existingSet = new Set(
        existingAnimeProducers.map((ep) => `${ep.animeId}:${ep.producerId}`)
      )
      const newRelations = relations.filter(
        (r) => !existingSet.has(`${r.animeId}:${r.producerId}`)
      )
      await db.insert(animeProducer).values(newRelations).onConflictDoNothing()

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
      const existingAnime = await db
        .select({ id: anime.malId })
        .from(anime)
        .where(inArray(anime.malId, relatedIds))

      const validRelatedIds = new Set(existingAnime.map((a) => a.id))

      // 3. Filtrar relaciones inválidas
      const validRelations = relations.filter((r) =>
        validRelatedIds.has(r.relatedAnimeId)
      )

      if (validRelations.length === 0) return 0

      // 4. Insertar solo los válidos
      await db
        .insert(animeRelatedAnime)
        .values(validRelations)
        .onConflictDoNothing()

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
      const existingCharacters = await db
        .select({ id: character.malId })
        .from(character)
        .where(inArray(character.malId, characterIds))

      const validCharacterIds = new Set(existingCharacters.map((c) => c.id))

      // 3. Filtrar relaciones inválidas
      const validRelations = relations.filter((r) =>
        validCharacterIds.has(r.characterId)
      )

      if (validRelations.length === 0) return 0

      // 4. Insertar solo las válidas
      await db
        .insert(animeCharacter)
        .values(validRelations)
        .onConflictDoNothing()

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
      const existingStaff = await db
        .select({ id: staff.malId })
        .from(staff)
        .where(inArray(staff.malId, staffIds))

      const validStaffIds = new Set(existingStaff.map((s) => s.id))

      // 3. filtrar relaciones inválidas
      const validRelations = relations.filter((r) =>
        validStaffIds.has(r.staffId)
      )

      if (validRelations.length === 0) return 0

      // 4. insertar solo las válidas
      await db
        .insert(animeStaff)
        .values(
          validRelations.map(({ animeId, staffId, role }) => ({
            animeId,
            staffId,
            role,
          }))
        )
        .onConflictDoNothing()

      return validRelations.length
    } catch (e) {
      console.error('Failed to upsert anime staff batch:', e)
      return 0
    }
  },
  async upsertCharacterVoiceActorsBatch(
    relations: NewCharacterVoiceActor[]
  ): Promise<number> {
    const existingVoiceActors = await db
      .select({
        characterId: character.malId,
        staffId: staff.malId,
      })
      .from(characterVoiceActor)
      .where(
        inArray(
          characterVoiceActor.characterId,
          relations.map((r) => r.characterId)
        )
      )
    const existingSet = new Set(
      existingVoiceActors.map((eva) => `${eva.characterId}:${eva.staffId}`)
    )
    const newRelations = relations.filter(
      (r) => !existingSet.has(`${r.characterId}:${r.staffId}`)
    )
    try {
      await db
        .insert(characterVoiceActor)
        .values(newRelations)
        .onConflictDoNothing()
      return newRelations.length
    } catch (e) {
      console.error('Failed to upsert character voice actors batch:', e)
      return 0
    }
  },

  async upsertStaffMediaBatch(relations: NewMedia[]): Promise<number> {
    const existingStaffMedia = await db
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
      existingStaffMedia.map(
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
      console.error('Failed to upsert staff media batch:', e)
      return 0
    }
  },

  async saveAnimeDetails(
    animeDetailsResults: AnimeRelationsProcessorResult[]
  ): Promise<void> {
    const genreRelations: NewAnimeGenre[] = []
    const themeRelations: NewAnimeTheme[] = []
    const demographicRelations: NewAnimeDemographic[] = []
    const producerRelations: NewAnimeProducer[] = []

    for (const result of animeDetailsResults) {
      genreRelations.push(...result.animeGenres)
      themeRelations.push(...result.animeThemes)
      demographicRelations.push(...result.animeDemographics)
      producerRelations.push(...result.animeProducers)

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

    await this.upsertAnimeGenresBatch(uniqueGenreRelations)
    await this.upsertAnimeThemesBatch(uniqueThemeRelations)
    await this.upsertAnimeDemographicsBatch(uniqueDemographicRelations)
    await this.upsertAnimeProducersBatch(uniqueProducerRelations)

  },
  async saveAnimeCharacters(
    animeCharactersResults: AnimeCharactersProcessorResult[]
  ): Promise<void> {
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
    await this.upsertAnimeCharactersBatch(uniqueCharacterRelations)

    await this.upsertCharacterVoiceActorsBatch(uniqueCharacterVoiceActors)
  },
  async saveAnimeStaff(
    animeStaffResults: AnimeStaffProcessorResult[]
  ): Promise<void> {
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
    await this.upsertAnimeStaffBatch(uniqueStaffRelations)
    await this.upsertStaffMediaBatch(uniqueStaffMedia)
  },
}
