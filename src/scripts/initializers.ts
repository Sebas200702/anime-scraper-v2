import { isRetiredSource } from '../config/incremental.js'
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
import { initializeAnilistMangaLinkTasks } from './initializeAnilistMangaLinkTasks.js'
import { initializeMalDetailsTasks } from './initializeMalDetailsTasks.js'
import { initializeMalHtmlTasks } from './initializeMalHtmlTasks.js'
import { initializeMalPeopleTasks } from './initializeMalPeopleTasks.js'
import { initializeAnnTasks } from './initializeAnnTasks.js'
import { initializeTvdbEpisodesTasks } from './initializeTvdbEpisodesTasks.js'
import { initializeTmdbTasks } from './initializeTmdbTasks.js'
import { initializeMalMangaTasks } from './initializeMalMangaTasks.js'
import { initializeMalCharactersTasks } from './initializeMalCharactersTasks.js'
import { initializeMalMangaCharactersTasks } from './initializeMalMangaCharactersTasks.js'
import { initializeMalPersonTasks } from './initializeMalPersonTasks.js'
import { initializeAnilistMediaTasks } from './initializeAnilistMediaTasks.js'
import { initializeMusicMetaTasks } from './initializeMusicMetaTasks.js'
import { initializeMalMangaPageTasks } from './initializeMalMangaPageTasks.js'
import { initializeMalProducerTasks } from './initializeMalProducerTasks.js'
import { initializeMalDiscoveryTasks } from './initializeMalDiscoveryTasks.js'

export type Initializer = () => Promise<void>

/**
 * `anilist` también siembra el enlace de manga (S6, L14): va antes que
 * `anilistMedia` en el orden de derivados, y el pase corre en el grupo hot.
 */
const initializeAnilistAll: Initializer = async () => {
  await initializeAnilistTasks()
  await initializeAnilistMangaLinkTasks()
}

export const INITIALIZERS: Record<string, Initializer> = {
  jikan: initializeTasks,
  jikanRelations: initializeJikanRelationsTasks,
  animeThemes: initializeAnimeThemesTasks,
  animeMapping: initializeAnimeMappingTasks,
  animeEpisodes: initializeAnimeEpisodesTasks,
  tvdbSeriesArtworks: initializeTvdbSeriesArtworksTasks,
  anilist: initializeAnilistAll,
  mal: initializeMalDetailsTasks,
  malHtml: initializeMalHtmlTasks,
  malPeople: initializeMalPeopleTasks,
  ann: initializeAnnTasks,
  tvdbEpisodes: initializeTvdbEpisodesTasks,
  tmdb: initializeTmdbTasks,
  malManga: initializeMalMangaTasks,
  malCharacters: initializeMalCharactersTasks,
  malMangaCharacters: initializeMalMangaCharactersTasks,
  malPerson: initializeMalPersonTasks,
  anilistMedia: initializeAnilistMediaTasks,
  musicMeta: initializeMusicMetaTasks,
  malMangaPage: initializeMalMangaPageTasks,
  malProducer: initializeMalProducerTasks,
  malDiscovery: initializeMalDiscoveryTasks,
}

/**
 * Fuentes que descubren anime nuevos por listado. Jikan está retirado: el
 * descubrimiento lo hace `malDiscovery` (temporadas + rankings de MAL API v2).
 */
export const LISTING_SOURCES = ['jikan', 'malDiscovery'].filter(
  (source) => !isRetiredSource(source)
)

/** Fuentes que dependen de que `anime` ya exista (se siembran después del listado). */
export const DERIVED_SOURCES = Object.keys(INITIALIZERS).filter(
  (source) => !LISTING_SOURCES.includes(source) && !isRetiredSource(source)
)
