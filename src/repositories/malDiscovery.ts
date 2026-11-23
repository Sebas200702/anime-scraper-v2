import { db } from '../libs/db.js'
import type { MinimalMangaRow } from '../processors/malDiscoveryManga.js'
import type { MalMangaProcessorResult } from '../processors/malManga.js'
import type { AnimeMalDetailsProcessorResult } from '../types/index.js'
import { chunk } from '../utils/chunk.js'
import { malRepository } from './mal.js'
import { malMangaRepository } from './malManga.js'
import { insertUnknownMangaSql } from './mal/mangaDiscoverySql.js'
import { refreshKnownManga } from './mal/mangaRefresh.js'

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
   * Ranking de manga (S6): inserta los ids desconocidos y a los recién
   * insertados les aplica la ficha del ranking (L12: sinopsis, portada,
   * géneros…). Los que ya existían se refrescan con `refreshKnownManga`
   * (T10, L16: relleno de NULL, stats volátiles no nulas, junctions solo si
   * no hay). Devuelve solo los insertados, más los que el barrido ya guardó
   * página a página (`inserted`, L9); el refresco no cuenta.
   */
  async saveMalDiscoveryMangaRanking(
    results: {
      rows?: MinimalMangaRow[]
      details?: MalMangaProcessorResult[]
      inserted?: number
    }[]
  ): Promise<number> {
    const details = new Map(
      results.flatMap((r) => r.details ?? []).map((d) => [d.manga.malId, d])
    )
    const rows = new Map<number, MinimalMangaRow>()
    for (const row of results.flatMap((r) => r.rows ?? []))
      if (!rows.has(row.malId)) rows.set(row.malId, row)
    let inserted = results.reduce((sum, r) => sum + (r.inserted ?? 0), 0)
    // 7 parámetros por fila: lotes muy por debajo del límite de Postgres.
    for (const batch of chunk([...rows.values()], 1_000)) {
      const result = await db.execute(insertUnknownMangaSql(batch))
      inserted += result.rowCount ?? 0
      const freshIds = new Set(result.rows.map((r) => Number(r.mal_id)))
      const fresh = batch.flatMap((r) => {
        const detail = details.get(r.malId)
        return detail && freshIds.has(r.malId) ? [detail] : []
      })
      if (fresh.length > 0) await malMangaRepository.saveMalManga(fresh)
      await refreshKnownManga(
        batch.flatMap((r) => {
          const detail = details.get(r.malId)
          return detail && !freshIds.has(r.malId) ? [detail] : []
        })
      )
    }
    return inserted
  },
}
