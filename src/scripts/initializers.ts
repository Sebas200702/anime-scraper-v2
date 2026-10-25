/**
 * Registro único de generadores (initializers) por fuente.
 *
 * Lo comparten `index.ts` (una fuente), `backfillAll.ts` (varias en paralelo) e
 * `incremental.ts` (Modo B). Antes estaba duplicado en los dos primeros: añadir
 * una fuente y olvidar uno de los mapas dejaba tareas sin sembrar.
 */
import { initializeTasks } from './initializeTasks.js'
import { initializeJikanRelationsTasks } from './initializeJikanRelationsTasks.js'
import { initializeAnimeThemesTasks } from './initializeAnimeThemesTasks.js'
import { initializeAnimeMappingTasks } from './initializeAnimeMappingTasks.js'
import { initializeAnimeEpisodesTasks } from './initializeAnimeEpisodesTasks.js'
import { initializeTvdbSeriesArtworksTasks } from './initializeTvdbSeriesArtworksTasks.js'
import { initializeAnilistTasks } from './initializeAnilistTasks.js'
import { initializeMalDetailsTasks } from './initializeMalDetailsTasks.js'
import { initializeMalHtmlTasks } from './initializeMalHtmlTasks.js'
import { initializeMalPeopleTasks } from './initializeMalPeopleTasks.js'
import { initializeAnnTasks } from './initializeAnnTasks.js'
import { initializeTvdbEpisodesTasks } from './initializeTvdbEpisodesTasks.js'
import { initializeTmdbTasks } from './initializeTmdbTasks.js'
import { initializeMalMangaTasks } from './initializeMalMangaTasks.js'
import { initializeMalCharactersTasks } from './initializeMalCharactersTasks.js'
import { initializeMalPersonTasks } from './initializeMalPersonTasks.js'
import { initializeAnilistMediaTasks } from './initializeAnilistMediaTasks.js'
import { initializeMusicMetaTasks } from './initializeMusicMetaTasks.js'
import { initializeMalMangaPageTasks } from './initializeMalMangaPageTasks.js'
import { initializeMalProducerTasks } from './initializeMalProducerTasks.js'

export type Initializer = () => Promise<void>

export const INITIALIZERS: Record<string, Initializer> = {
  jikan: initializeTasks,
  jikanRelations: initializeJikanRelationsTasks,
  animeThemes: initializeAnimeThemesTasks,
  animeMapping: initializeAnimeMappingTasks,
  animeEpisodes: initializeAnimeEpisodesTasks,
  tvdbSeriesArtworks: initializeTvdbSeriesArtworksTasks,
  anilist: initializeAnilistTasks,
  mal: initializeMalDetailsTasks,
  malHtml: initializeMalHtmlTasks,
  malPeople: initializeMalPeopleTasks,
  ann: initializeAnnTasks,
  tvdbEpisodes: initializeTvdbEpisodesTasks,
  tmdb: initializeTmdbTasks,
  malManga: initializeMalMangaTasks,
  malCharacters: initializeMalCharactersTasks,
  malPerson: initializeMalPersonTasks,
  anilistMedia: initializeAnilistMediaTasks,
  musicMeta: initializeMusicMetaTasks,
  malMangaPage: initializeMalMangaPageTasks,
  malProducer: initializeMalProducerTasks,
}

/** Fuentes que dependen de que `anime` ya exista (se siembran después de jikan). */
export const DERIVED_SOURCES = Object.keys(INITIALIZERS).filter(
  (source) => source !== 'jikan'
)
