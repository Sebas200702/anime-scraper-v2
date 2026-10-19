import type {
  ScrapingTask,
  TvdbEpisodesProcessorResult,
} from '../types/index.js'

/**
 * Convierte los episodios de TVDB en filas con su imagen.
 *
 * TVDB entrega el criterio de orden ("Aired Order", "DVD Order"…) mezclado en la
 * respuesta y con la numeración reiniciada por bloques, así que aquí solo se
 * normaliza: el repositorio decide el bloque que corresponde a nuestro anime.
 */
export const processTvdbEpisodes = (
  raw: { animeId: number; tvdbId: number; episodes: any[] },
  _task: ScrapingTask
): TvdbEpisodesProcessorResult => ({
  animeId: raw.animeId,
  episodes: (raw.episodes ?? [])
    .filter((e) => e?.image)
    .map((e) => ({
      number: typeof e.number === 'number' ? e.number : null,
      absoluteNumber:
        typeof e.absoluteNumber === 'number' ? e.absoluteNumber : null,
      aired: e.aired ?? null,
      name: e.name ?? null,
      image: e.image as string,
    })),
})
