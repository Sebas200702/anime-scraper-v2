import { db } from '../libs/db.js'
import { chunk, MAX_PARAMS_PER_STATEMENT } from '../utils/chunk.js'
import type { PgTable } from 'drizzle-orm/pg-core'

/**
 * Generic batch upsert function that eliminates repetitive repository code.
 * Handles chunking, transactions, and error handling in one place.
 *
 * @param table - The Drizzle ORM table schema
 * @param items - Array of items to upsert
 * @param columnsPerRow - Number of columns per row (for calculating batch size)
 * @param label - Label for error logging
 * @param txCtx - Optional transaction context for nested transactions
 * @returns Number of items upserted
 * @throws When the batch fails, so callers never confirm a lost write.
 */
export async function batchUpsert<T extends Record<string, unknown>>(
  table: PgTable,
  items: T[],
  columnsPerRow: number,
  label: string,
  txCtx?: any
): Promise<number> {
  if (!items || items.length === 0) return 0

  try {
    const batchSize = Math.floor(MAX_PARAMS_PER_STATEMENT / columnsPerRow)

    const run = async (tx: any) => {
      for (const batch of chunk(items, batchSize)) {
        await tx.insert(table).values(batch).onConflictDoNothing()
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
