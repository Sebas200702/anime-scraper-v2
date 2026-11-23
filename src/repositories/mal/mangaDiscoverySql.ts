import { sql, type SQL } from 'drizzle-orm'
import type { MinimalMangaRow } from '../../processors/malDiscoveryManga.js'

/**
 * INSERT de manga desconocidos (S6). `ON CONFLICT (mal_id) DO NOTHING`
 * dirigido a la clave: una fila existente nunca se pisa y cualquier otro
 * error (otra restricción) sigue fallando fuerte. La ficha completa la trae
 * después `malManga`.
 */
export const insertUnknownMangaSql = (rows: MinimalMangaRow[]): SQL => {
  const values = sql.join(
    rows.map(
      (r) =>
        sql`(${r.malId}, ${r.title}, ${r.type}, ${r.status}, ${r.chapters}, ${r.volumes}, ${r.year})`
    ),
    sql`, `
  )
  return sql`
    INSERT INTO manga (mal_id, title, type, status, chapters, volumes, year)
    VALUES ${values}
    ON CONFLICT (mal_id) DO NOTHING
  `
}
