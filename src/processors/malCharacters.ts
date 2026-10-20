import { parseMalCharactersPage } from '../shared/malCharactersHtml.js'
import type { ScrapingTask } from '../types/index.js'

/**
 * Mapea la página de personajes de MAL a las filas del catálogo.
 *
 * De aquí salen: el personaje (con su nombre nativo), el vínculo anime ↔
 * personaje con su rol, el **retrato** del personaje y las **voces** (con su
 * idioma), que alimentan la tabla `character_voice_actor`.
 */
export const processMalCharacters = (
  raw: { animeId: number; html: string },
  _task: ScrapingTask
) => {
  const characters = parseMalCharactersPage(raw.html)

  return {
    animeId: raw.animeId,
    characters: characters.map((c) => ({
      animeId: raw.animeId,
      characterId: c.malId,
      name: c.name,
      nativeName: c.nativeName,
      role: c.role,
      favourites: c.favourites,
      image: c.image ?? null,
    })),
    voiceActors: characters.flatMap((c) =>
      c.voiceActors.map((va) => ({
        animeId: raw.animeId,
        characterId: c.malId,
        staffId: va.malId,
        name: va.name,
        language: va.language,
        image: va.image ?? null,
      }))
    ),
  }
}

export type MalCharactersProcessorResult = ReturnType<
  typeof processMalCharacters
>
