import {
  isRealMalImage,
  parseMalCharactersPage,
} from '../shared/malCharactersHtml.js'
import type { ScrapingTask } from '../types/index.js'

/**
 * Mapea la página de personajes de un manga de MAL a las filas del catálogo:
 * el personaje (id real de MAL, sin nativo: la página solo da el romaji), su
 * rol en el manga y su retrato (sin el interrogante de los que no tienen).
 */
export const processMalMangaCharacters = (
  raw: { mangaId: number; html: string },
  _task: ScrapingTask
) => ({
  mangaId: raw.mangaId,
  characters: parseMalCharactersPage(raw.html, 'manga').map((c) => ({
    mangaId: raw.mangaId,
    characterId: c.malId,
    name: c.name,
    nativeName: c.nativeName,
    role: c.role,
    image: isRealMalImage(c.image) ? c.image : null,
  })),
})

export type MalMangaCharactersProcessorResult = ReturnType<
  typeof processMalMangaCharacters
>
