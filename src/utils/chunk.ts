/**
 * Postgres limita el número de parámetros por sentencia (65535). Se usa un
 * tope prudente para que `floor(MAX / columnas)` siga siendo conservador.
 */
export const MAX_PARAMS_PER_STATEMENT = 30_000

/**
 * Split an array into chunks of a given size.
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (size <= 0) throw new Error('Chunk size must be positive')
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

/**
 * Calculate the maximum number of rows that can be inserted in a single
 * INSERT statement given the number of columns per row.
 *
 * @param columnsPerRow - number of bound parameters per row
 * @param maxVariables  - SQLite variable limit (default 900)
 */
export function maxInsertRows(
  columnsPerRow: number,
  maxVariables = MAX_PARAMS_PER_STATEMENT
): number {
  return Math.max(1, Math.floor(maxVariables / columnsPerRow))
}
