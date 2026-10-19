import type { AnnProcessorResult, ScrapingTask } from '../types/index.js'
import { parseAnnExternalIds, parseAnnThemes } from '../shared/annAnime.js'

/**
 * Convierte la ficha de ANN en filas de música.
 *
 * Si la página declara un id de MAL y **no** es el nuestro, la ficha es de
 * otro anime (o la tabla de la enciclopedia cambió): se descarta en vez de
 * colgar canciones ajenas.
 */
export const processAnnThemes = (
  raw: { html: string; annId: number },
  task: ScrapingTask
): AnnProcessorResult => {
  const { animeId } = task.payload as { animeId?: number }
  const external = parseAnnExternalIds(raw.html)
  if (external.malId !== null && animeId && external.malId !== animeId) {
    return { themes: [], mismatched: true }
  }
  const themes = parseAnnThemes(raw.html)
  return {
    themes: themes.map((t) => ({
      annId: raw.annId,
      animeId: animeId ?? 0,
      kind: t.kind,
      sequence: t.sequence,
      title: t.title,
      artist: t.artist,
      variant: t.variant,
      episodes: t.episodes,
    })),
    mismatched: false,
  }
}
