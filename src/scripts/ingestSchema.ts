/**
 * Aplica el DDL de `ingest.*` (idempotente) a la DB configurada.
 *
 *   bun run db:ingest-schema
 *
 * En prod el contenedor lo corre en el arranque: crea solo el schema de la cola
 * (el catálogo es de la app y no se toca). Reintenta si la DB aún no está
 * lista, para no tirar el primer deploy.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { closeDb, pool } from '../libs/db.js'

const file =
  process.env.INGEST_SCHEMA_FILE ??
  join(process.cwd(), 'scripts', 'ingest-schema.sql')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const waitForDb = async (attempts = 30): Promise<void> => {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await pool.query('SELECT 1')
      return
    } catch (error) {
      const message = (error as Error).message
      if (attempt === attempts) throw error
      console.log(
        `⏳ DB no lista (${message}); reintento ${attempt}/${attempts}`
      )
      await sleep(2000)
    }
  }
}

const main = async () => {
  await waitForDb()
  const raw = await readFile(file, 'utf-8')
  const ddl = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  const statements = ddl
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)

  for (const statement of statements) {
    await pool.query(statement)
  }

  console.log(`✅ ingest.* aplicado (${statements.length} statements)`)
}

try {
  await main()
} catch (error) {
  console.error('Fatal ingestSchema:', error)
  process.exitCode = 1
} finally {
  await closeDb()
}
