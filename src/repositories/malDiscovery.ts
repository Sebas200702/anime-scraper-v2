import { db } from '../libs/db.js'
import type { MinimalMangaRow } from '../processors/malDiscoveryManga.js'
import type { AnimeMalDetailsProcessorResult } from '../types/index.js'
import { chunk } from '../utils/chunk.js'
import { malRepository } from './mal.js'
import { insertUnknownMangaSql } from './mal/mangaDiscoverySql.js'

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

  /**
   * Ranking de manga (S6): solo inserta los ids desconocidos; los existentes
   * no se tocan (su ficha la mantiene `malManga`). Devuelve los insertados,
   * más los que el barrido ya guardó página a página (`inserted`, L9).
   */
  async saveMalDiscoveryMangaRanking(
    results: { rows?: MinimalMangaRow[]; inserted?: number }[]
  ): Promise<number> {
    const rows = new Map<number, MinimalMangaRow>()
    for (const row of results.flatMap((r) => r.rows ?? []))
      if (!rows.has(row.malId)) rows.set(row.malId, row)
    let inserted = results.reduce((sum, r) => sum + (r.inserted ?? 0), 0)
    // 7 parámetros por fila: lotes muy por debajo del límite de Postgres.
    for (const batch of chunk([...rows.values()], 1_000)) {
      const result = await db.execute(insertUnknownMangaSql(batch))
      inserted += result.rowCount ?? 0
    }
    return inserted
  },
}
