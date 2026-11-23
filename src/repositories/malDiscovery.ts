import type { AnimeMalDetailsProcessorResult } from '../types/index.js'
import { malRepository } from './mal.js'

type RankingBatch = { results?: AnimeMalDetailsProcessorResult[] }[]

/**
 * Guardado del descubrimiento: el mismo camino que el ranking de `mal`, que
 * inserta los ids desconocidos como filas mínimas antes del parche (S1).
 */
export const malDiscoveryRepository = {
  saveMalDiscoverySeason: (results: RankingBatch) =>
    malRepository.saveMalRanking(results),
  saveMalDiscoveryRanking: (results: RankingBatch) =>
    malRepository.saveMalRanking(results),
}
