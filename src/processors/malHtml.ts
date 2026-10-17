import type {
  MalCharactersProcessorResult,
  ScrapingTask,
} from '../types/index.js'
import { parseMalAnimeCharacters } from '../shared/malAnimeHtml.js'

/**
 * Convierte la ficha HTML de MAL en filas para el catálogo: character, staff,
 * `anime_character`, `anime_staff`, `character_voice_actor` y la media
 * (retratos). Todo con **ids MAL** nativos.
 */
export const processMalCharacters = (
  raw: { html: string; animeId: number },
  _task: ScrapingTask
): MalCharactersProcessorResult => {
  const { animeCharacters, animeStaff } = parseMalAnimeCharacters(raw.html)
  const animeId = raw.animeId

  const characters = animeCharacters.map((c) => ({
    malId: c.malId,
    name: c.name,
  }))
  const staff = animeStaff.map((s) => ({ malId: s.malId, name: s.name }))

  return {
    characters,
    staff,
    animeCharacters: animeCharacters.map((c) => ({
      animeId,
      characterId: c.malId,
      role: c.role,
    })),
    animeStaff: animeStaff.flatMap((s) =>
      s.roles.map((role) => ({ animeId, staffId: s.malId, role }))
    ),
    characterVoiceActors: animeCharacters.flatMap((c) =>
      c.voiceActors.map((va) => ({
        characterId: c.malId,
        staffId: va.malId,
        language: va.language,
      }))
    ),
    // Los seiyuus también son `staff`: se garantiza su fila padre.
    voiceActorStaff: animeCharacters.flatMap((c) =>
      c.voiceActors.map((va) => ({ malId: va.malId, name: va.name }))
    ),
    characterMedia: animeCharacters
      .filter((c) => c.image)
      .map((c) => ({
        entityId: c.malId,
        src: c.image as string,
        mediaType: 'poster',
      })),
    staffMedia: animeStaff
      .filter((s) => s.image)
      .map((s) => ({
        entityId: s.malId,
        src: s.image as string,
        mediaType: 'poster',
      })),
  }
}
