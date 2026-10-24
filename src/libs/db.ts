import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { CONFIG } from '../config/config.js'

/**
 * Postgres local para la ingesta (cola `ingest.*` + catálogo). El mismo motor
 * que prod, así que el DDL y las queries no cambian al promover.
 *
 * `TURSO_*` quedó atrás con la Fase 2: la cola y el catálogo viven en la DB.
 */
const pool = new Pool({
  connectionString: CONFIG.DATABASE_URL,
  max: 10,
})

export const db = drizzle(pool)

/** Pool crudo para locks de sesión (advisory lock) y scripts operativos. */
export { pool }

export const closeDb = () => pool.end()
