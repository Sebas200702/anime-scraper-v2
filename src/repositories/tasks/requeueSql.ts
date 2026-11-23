import { sql } from 'drizzle-orm'
import { RETIRED_SOURCES } from '../../config/incremental.js'

/**
 * Re-encola dead_letter que murieron por causas transitorias. Nunca las de
 * fuentes retiradas: su "timeout" es la API caída, no un fallo pasajero.
 */
export const requeueTransientSql = (limit: number) => sql`
  UPDATE ingest.task
  SET status = 'pending', scheduled_at = now(), attempts = 0,
      leased_until = NULL, updated_at = now()
  WHERE id IN (
    SELECT id FROM ingest.task
    WHERE status = 'dead_letter'
      AND source NOT IN (${sql.join(
        RETIRED_SOURCES.map((source) => sql`${source}`),
        sql`, `
      )})
      AND last_error ~* '(timeout|timed out|ECONN|socket|blocked|rate.?limit|lease|fetch failed|network)'
    ORDER BY updated_at ASC
    LIMIT ${limit}
  )
`
