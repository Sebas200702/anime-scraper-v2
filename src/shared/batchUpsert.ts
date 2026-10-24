import { Column, sql, type SQL } from 'drizzle-orm'
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core'
import { db } from '../libs/db.js'
import { chunk, MAX_PARAMS_PER_STATEMENT } from '../utils/chunk.js'

/**
 * Opciones del upsert.
 *
 * Sin `update` el comportamiento histórico es `ON CONFLICT DO NOTHING`: es lo
 * correcto para junctions (insertar dos veces la misma relación no aporta
 * nada). Con `update` la fila existente se refresca, que es lo que necesita el
 * Modo B: re-scrapear un anime terminado tiene que actualizar `status`,
 * `score`, `episodes`, etc., no descartar el payload nuevo.
 */
export interface BatchUpsertOptions {
  /** Refresca las columnas no-clave en conflicto (`ON CONFLICT DO UPDATE`). */
  update?: boolean
  /**
   * Columnas de la clave natural para `ON CONFLICT`. Por defecto la PK de la
   * tabla; las tablas con id surrogate necesitan su índice único (p. ej.
   * `episode` → `(anime_id, number)`).
   */
  conflictTarget?: string[]
  /** Columnas que no deben sobrescribirse nunca (además de la clave). */
  omitFromUpdate?: string[]
}

/** Nombre de columna en la DB → propiedad de la tabla en TypeScript. */
const keyByColumnName = (table: PgTable): Map<string, string> => {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(table)) {
    if (value instanceof Column) out.set(value.name, key)
  }
  return out
}

const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`

/**
 * `SET col = COALESCE(excluded.col, tabla.col)`.
 *
 * `COALESCE` es deliberado: una fuente puede dejar de devolver un dato (p. ej.
 * `title_english` null o `score` null antes del estreno) y no queremos que un
 * refresh degrade lo que ya estaba bien. Las columnas clave nunca se tocan.
 */
const buildUpdateSet = (
  table: PgTable,
  target: string[],
  omit: string[]
): Record<string, SQL> => {
  const config = getTableConfig(table)
  const tsKeys = keyByColumnName(table)
  const skip = new Set([...target, ...omit])
  const set: Record<string, SQL> = {}

  for (const column of config.columns) {
    if (skip.has(column.name)) continue
    const key = tsKeys.get(column.name)
    if (!key) continue
    set[key] = sql.raw(
      `coalesce(excluded.${quote(column.name)}, ${quote(config.name)}.${quote(column.name)})`
    )
  }

  return set
}

/**
 * Batch upsert genérico: trocea, corre en transacción y propaga el error para
 * que quien llama nunca confirme una escritura perdida.
 *
 * @param table - Tabla Drizzle
 * @param items - Filas a insertar
 * @param columnsPerRow - Columnas por fila (para el tamaño de lote)
 * @param label - Etiqueta para logs
 * @param txCtx - Transacción externa opcional
 */
export async function batchUpsert<T extends Record<string, unknown>>(
  table: PgTable,
  items: T[],
  columnsPerRow: number,
  label: string,
  txCtx?: any,
  options: BatchUpsertOptions = {}
): Promise<number> {
  if (!items || items.length === 0) return 0

  const config = getTableConfig(table)
  const tsKeys = keyByColumnName(table)
  const targetNames =
    options.conflictTarget ??
    config.columns
      .filter((column) => column.primary)
      .map((column) => column.name)
  const target = targetNames
    .map((name) => {
      const key = tsKeys.get(name)
      return key
        ? (table as unknown as Record<string, unknown>)[key]
        : undefined
    })
    .filter((column): column is Column => column instanceof Column)

  if (options.update && target.length === 0) {
    throw new Error(
      `${label}: sin clave de conflicto para ON CONFLICT DO UPDATE`
    )
  }

  const updateSet =
    options.update && target.length > 0
      ? buildUpdateSet(table, targetNames, options.omitFromUpdate ?? [])
      : null

  try {
    const batchSize = Math.floor(MAX_PARAMS_PER_STATEMENT / columnsPerRow)

    const run = async (tx: any) => {
      for (const batch of chunk(items, batchSize)) {
        if (updateSet && Object.keys(updateSet).length > 0) {
          await tx
            .insert(table)
            .values(batch)
            .onConflictDoUpdate({ target, set: updateSet })
        } else {
          await tx.insert(table).values(batch).onConflictDoNothing()
        }
      }
    }

    if (txCtx) {
      await run(txCtx)
    } else {
      await db.transaction(run)
    }

    return items.length
  } catch (error) {
    console.error(`Failed to upsert ${label}:`, error)
    throw error
  }
}
