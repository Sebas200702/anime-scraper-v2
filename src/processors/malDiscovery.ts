import { processMalRanking } from './mal.js'

/**
 * Descubrimiento (temporadas y rankings `upcoming`/`airing`): mismo mapeo por
 * nodo que el ranking bulk de `mal`, incluido el título (S1).
 */
export const processMalDiscoverySeason = processMalRanking
export const processMalDiscoveryRanking = processMalRanking
