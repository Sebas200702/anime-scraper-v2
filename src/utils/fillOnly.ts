import { Column, sql, type SQL } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'

/**
 * SET de un parche "solo rellena huecos" (S7): cada columna toma el valor
 * nuevo únicamente si la existente está vacía (`NULL`, o `''` en texto). Así
 * una fuente secundaria (AniList) nunca pisa lo que otra (MAL) ya escribió.
 *
 * @param table - Tabla Drizzle
 * @param cols - Propiedad TS de la columna → valor nuevo (ya sin undefined)
 * @returns Objeto listo para `db.update(table).set(...)`
 */
export function fillOnlySet(
  table: PgTable,
  cols: Record<string, unknown>
): Record<string, SQL> {
  const set: Record<string, SQL> = {}
  for (const [key, value] of Object.entries(cols)) {
    const column = (table as unknown as Record<string, unknown>)[key]
    if (!(column instanceof Column)) {
      throw new Error(`fillOnlySet: ${key} no es una columna de la tabla`)
    }
    const current =
      column.dataType === 'string' ? sql`NULLIF(${column}, '')` : sql`${column}`
    set[key] = sql`COALESCE(${current}, ${sql.param(value, column)})`
  }
  return set
}
