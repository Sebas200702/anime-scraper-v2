import {
  animeCharacter,
  animeDemographic,
  animeGenre,
  animeProducer,
  animeRelatedAnime,
  animeStaff,
  animeTheme,
} from '../schemas/animeRelations.js'
import { characterVoiceActor } from '../schemas/characterRelations.js'
import { mediaRepository } from './media.js'
import { anime } from '../schemas/anime.js'
import { character } from '../schemas/character.js'
import { staff } from '../schemas/staff.js'
import { unique } from '../utils/deduplicate.js'
import { batchUpsert } from '../shared/batchUpsert.js'
import type {
  AnimeRelationsProcessorResult,
  AnimeCharactersProcessorResult,
  AnimeStaffProcessorResult,
  NewAnime,
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
import { filterByExistingFk } from '../shared/fkFilter.js'

export const jikanRelationsRepository = {
  async saveAnimeDetails(
    results: AnimeRelationsProcessorResult[]
  ): Promise<number> {
    const animes: NewAnime[] = []
    const genres: NewAnimeGenre[] = []
    const themes: NewAnimeTheme[] = []
    const demographics: NewAnimeDemographic[] = []
    const producers: NewAnimeProducer[] = []
    const related: NewAnimeRelatedAnime[] = []

    for (const r of results) {
      if (r.anime) animes.push(r.anime)
      if (r.animeGenres) genres.push(...r.animeGenres)
      if (r.animeThemes) themes.push(...r.animeThemes)
      if (r.animeDemographics) demographics.push(...r.animeDemographics)
      if (r.animeProducers) producers.push(...r.animeProducers)
      if (r.animeRelatedAnime) related.push(...r.animeRelatedAnime)
    }

    const uAnimes = unique(animes, (a) => a.malId)
    const uGenres = unique(genres, (g) => `${g.animeId}:${g.genreId}`)
    const uThemes = unique(themes, (t) => `${t.animeId}:${t.themeId}`)
    const uDemo = unique(demographics, (d) => `${d.animeId}:${d.demographicId}`)
    const uProducers = unique(producers, (p) => `${p.animeId}:${p.producerId}`)
    const uRelated = unique(
      related,
      (r) => `${r.animeId}:${r.relatedAnimeId}:${r.relationType}`
    )

    // Filter related anime by existing FK
    const validRelated = await filterByExistingFk(
      uRelated,
      (r) => r.relatedAnimeId,
      anime,
      anime.malId
    )

    // La fila `anime` primero (padre). `update: true` es el corazón del Modo B:
    // con `DO NOTHING` el refresh descartaba el `/full` y `status`/`episodes`
    // nunca cambiaban. `COALESCE` evita degradar con nulos de la fuente.
    const animeSaved = await batchUpsert(
      anime,
      uAnimes,
      26,
      'anime',
      undefined,
      {
        update: true,
      }
    )

    await Promise.all([
      batchUpsert(animeGenre, uGenres, 2, 'anime-genres'),
      batchUpsert(animeTheme, uThemes, 2, 'anime-themes'),
      batchUpsert(animeDemographic, uDemo, 2, 'anime-demographics'),
      batchUpsert(animeProducer, uProducers, 2, 'anime-producers'),
      batchUpsert(animeRelatedAnime, validRelated, 4, 'anime-related'),
    ])

    return (
      animeSaved +
      uGenres.length +
      uThemes.length +
      uDemo.length +
      uProducers.length +
      validRelated.length
    )
  },

  async saveAnimeCharacters(
    results: AnimeCharactersProcessorResult[]
  ): Promise<number> {
    const chars: NewAnimeCharacter[] = []
    const voiceActors: NewCharacterVoiceActor[] = []

    for (const r of results) {
      chars.push(...r.animeCharacters)
      voiceActors.push(...r.characterVoiceActors)
    }

    const uChars = unique(
      chars,
      (c) => `${c.animeId}:${c.characterId}:${c.role}`
    )
    const uVA = unique(
      voiceActors,
      (s) => `${s.characterId}:${s.staffId}:${s.language}`
    )

    // Filter by existing character FK
    const validChars = await filterByExistingFk(
      uChars,
      (c) => c.characterId,
      character,
      character.malId
    )

    await Promise.all([
      batchUpsert(animeCharacter, validChars, 3, 'anime-characters'),
      batchUpsert(characterVoiceActor, uVA, 3, 'voice-actors'),
    ])

    return validChars.length + uVA.length
  },

  async saveAnimeStaff(results: AnimeStaffProcessorResult[]): Promise<number> {
    const staffRels: NewAnimeStaff[] = []
    const staffMedia: NewMedia[] = []

    for (const r of results) {
      staffRels.push(...r.animeStaffs)
      staffMedia.push(...r.staffMedia)
    }

    const uStaff = unique(
      staffRels,
      (s) => `${s.animeId}:${s.staffId}:${s.role}`
    )
    const uMedia = unique(
      staffMedia,
      (m) => `${m.entityId}:${m.mediaType}:${m.size}:${m.src}`
    )

    // Filter by existing staff FK
    const validStaff = await filterByExistingFk(
      uStaff,
      (s) => s.staffId,
      staff,
      staff.malId
    )

    await Promise.all([
      batchUpsert(animeStaff, validStaff, 3, 'anime-staff'),
      mediaRepository.saveMedia(uMedia, 'jikan'),
    ])

    return validStaff.length + uMedia.length
  },
}
