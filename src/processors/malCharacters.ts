import type { MalCharactersPayload } from '../services/malCharacters.js'
import type { ScrapingTask } from '../types/index.js'

/**
 * Mapea el reparto completo de MAL a las filas del catálogo.
 *
 * El id de MAL de un personaje es un id de **persona**: la ficha de esa
 * persona trae su nombre y su retrato (fuente `malPerson`). Aquí solo se crea
 * el vínculo anime ↔ personaje con su rol; el nombre se rellena después.
 */
export const processMalCharacters = (
  raw: MalCharactersPayload,
  _task: ScrapingTask
) => ({
  animeId: raw.animeId,
  characters: raw.characters.map((c) => ({
    animeId: raw.animeId,
    characterId: c.characterId,
    role: c.role,
  })),
})

export type MalCharactersProcessorResult = ReturnType<
  typeof processMalCharacters
>
