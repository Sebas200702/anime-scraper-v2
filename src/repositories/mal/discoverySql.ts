import { sql, type SQL } from 'drizzle-orm'
import type { AnimeMalDetailsProcessorResult } from '../../types/index.js'

/** Fila mínima de `anime` para un id que MAL lista y el catálogo no tiene. */
export interface MinimalAnimeRow {
  malId: number
  title: string
  type: string | null
  status: string | null
  episodes: number | null
  year: number | null
  season: string | null
}

/**
 * Filas mínimas a partir de los resultados del processor (valores ya mapeados
 * con TYPE/STATUS_MAP). Los nodos sin título se omiten: `title` es NOT NULL y
 * no se inventa.
 */
export const minimalAnimeRows = (
  results: AnimeMalDetailsProcessorResult[]
): MinimalAnimeRow[] => {
  const rows = new Map<number, MinimalAnimeRow>()
  for (const { animeStats: stats } of results) {
    const title = stats?.title?.trim()
    if (!stats?.malId || !title || rows.has(stats.malId)) continue
    rows.set(stats.malId, {
      malId: stats.malId,
      title,
      type: stats.type ?? null,
      status: stats.status ?? null,
      episodes: stats.episodes ?? null,
      year: stats.year ?? null,
      season: stats.season ?? null,
    })
  }
  return [...rows.values()]
}

/**
 * INSERT de ids desconocidos. `ON CONFLICT DO NOTHING`: una fila existente
 * (y su título) nunca se pisa; el resto lo escribe el parche disperso después.
 */
export const insertUnknownAnimeSql = (rows: MinimalAnimeRow[]): SQL => {
  const values = sql.join(
    rows.map(
      (r) =>
        sql`(${r.malId}, ${r.title}, ${r.type}, ${r.status}, ${r.episodes}, ${r.year}, ${r.season})`
    ),
    sql`, `
  )
  return sql`
    INSERT INTO anime (mal_id, title, type, status, episodes, year, season)
    VALUES ${values}
    ON CONFLICT (mal_id) DO NOTHING
  `
}
