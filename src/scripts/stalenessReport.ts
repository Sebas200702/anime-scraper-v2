/**
 * Reporte de frescura de la hidratación continua (S9). Solo lectura.
 *
 *   bun run incremental:report
 *
 * Imprime cinco vistas: (A) anime con estado inconsistente con sus fechas,
 * (B) estado en cola de la ficha MAL y los episodios de esos anime, (C) salud
 * de la cola por fuente hot, (D) corridas recientes por modo/grupo y (E) cola
 * por tipo de tarea de las fuentes slow (p. ej. reparto de manga). Corre en
 * una transacción `READ ONLY` que termina en ROLLBACK: no escribe nada.
 */
import { PgDialect } from 'drizzle-orm/pg-core'
import { closeDb, pool } from '../libs/db.js'
import { STALENESS_VIEWS } from '../repositories/tasks/stalenessSql.js'

const dialect = new PgDialect()

const main = async () => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN READ ONLY')
    for (const view of STALENESS_VIEWS) {
      const { sql, params } = dialect.sqlToQuery(view.query)
      const result = await client.query(sql, params)
      console.log(`\n── ${view.title} (${result.rowCount ?? 0} filas) ──`)
      if (result.rows.length > 0) console.table(result.rows)
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    client.release()
  }
}

try {
  await main()
} catch (error) {
  console.error('Fatal stalenessReport:', error)
  process.exitCode = 1
} finally {
  await closeDb()
}
