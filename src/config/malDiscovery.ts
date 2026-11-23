/**
 * Tareas de descubrimiento de anime nuevos sin Jikan (MAL API v2).
 *
 * Ids estables: la temporada concreta se calcula al hacer el fetch
 * (`seasonOffset` 0 = actual, 1 = siguiente), así las temporadas viejas no
 * quedan refrescándose a diario para siempre.
 */
export const MAL_DISCOVERY_SOURCE = 'malDiscovery'

export const MAL_DISCOVERY_SEASON_TASK = 'anime_mal_discovery_season_hydration'
export const MAL_DISCOVERY_RANKING_TASK =
  'anime_mal_discovery_ranking_hydration'
/** Manga nuevos (S6): ranking de manga de la MAL API v2, semanal. */
export const MAL_DISCOVERY_MANGA_RANKING_TASK =
  'manga_mal_discovery_ranking_hydration'

/**
 * Barrido reanudable del ranking de manga (S6, L9). Cada intento procesa como
 * mucho `pageBudget` páginas o `timeBudgetMs` (lo que llegue antes) y deja el
 * cursor en el payload; así ningún intento se acerca al deadline del discover
 * (600 s) ni al lease (900 s): peor caso ≈ 180 s + una página con sus
 * reintentos (3 × 20 s + 6 s de backoff). Mutable solo para los tests.
 */
export const MANGA_SWEEP_LIMITS = {
  pageBudget: 40,
  timeBudgetMs: 180_000,
  /** Intentos por página ante timeout/5xx/red (el fetcher no reintenta). */
  pageAttempts: 3,
  /** Backoff exponencial entre intentos de la misma página: 2 s, 4 s… */
  backoffMs: 2_000,
}

export interface MalDiscoveryTask {
  source: string
  entityId: string
  taskType: string
  priority: number
  status: 'pending'
  payload: { seasonOffset: number } | { rankingType: string }
}

const task = (
  entityId: string,
  taskType: string,
  payload: MalDiscoveryTask['payload']
): MalDiscoveryTask => ({
  source: MAL_DISCOVERY_SOURCE,
  entityId,
  taskType,
  priority: 25,
  status: 'pending',
  payload,
})

export const MAL_DISCOVERY_TASKS: readonly MalDiscoveryTask[] = [
  task('mal_discovery_season_current', MAL_DISCOVERY_SEASON_TASK, {
    seasonOffset: 0,
  }),
  task('mal_discovery_season_next', MAL_DISCOVERY_SEASON_TASK, {
    seasonOffset: 1,
  }),
  task('mal_discovery_ranking_upcoming', MAL_DISCOVERY_RANKING_TASK, {
    rankingType: 'upcoming',
  }),
  task('mal_discovery_ranking_airing', MAL_DISCOVERY_RANKING_TASK, {
    rankingType: 'airing',
  }),
  // `bypopularity` ordena por miembros, no por nota: un título nuevo (sin
  // score todavía) entra igual, al final. El ranking de manga no tiene
  // `upcoming`/`publishing`, así que el barrido completo es la única forma.
  task(
    'mal_discovery_manga_ranking_bypopularity',
    MAL_DISCOVERY_MANGA_RANKING_TASK,
    { rankingType: 'bypopularity' }
  ),
]
