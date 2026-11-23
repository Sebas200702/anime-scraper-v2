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
]
