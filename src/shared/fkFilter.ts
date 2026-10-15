import { db } from '../libs/db.js'
import { chunk, MAX_PARAMS_PER_STATEMENT } from '../utils/chunk.js'
import { inArray } from 'drizzle-orm/sql/expressions/conditions'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

/**
 * Filters an array of items to only include those whose FK reference
 * exists in the target table. This eliminates the repeated pattern of:
 *   1. Extract unique IDs
 *   2. Query existing IDs in batches
 *   3. Filter items by valid IDs
 *
 * Used by jikanRelations repository for anime, character, and staff FKs.
 *
 * @param items - Items to filter
 * @param getFkId - Extracts the FK value from each item
 * @param table - The target table to check existence against
 * @param column - The column in the target table to match against
 * @returns Filtered items where the FK exists
 */
export async function filterByExistingFk<T>(
  items: T[],
  getFkId: (item: T) => number,
  table: PgTable,
  column: PgColumn
): Promise<T[]> {
  if (items.length === 0) return []

  const uniqueIds = [...new Set(items.map(getFkId))]

  const validIds = new Set<number>()
  for (const batch of chunk(uniqueIds, MAX_PARAMS_PER_STATEMENT)) {
    const existing = await db
      .select({ id: column })
      .from(table)
      .where(inArray(column, batch))
    for (const row of existing) validIds.add(row.id as number)
  }

  return items.filter((item) => validIds.has(getFkId(item)))
}
