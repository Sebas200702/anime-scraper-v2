/**
 * Normaliza `ingest.task.refresh_after` a la política nueva (airing-aware).
 *
 *   bun run incremental:normalize            # aplica
 *   bun run incremental:normalize --dry-run  # solo cuenta
 *
 * Por qué existe: la cola viene de un backfill con `refresh_after` calculado
 * con la política vieja (p. ej. el listado cada 24 h). Sin este paso, la
 * primera corrida incremental re-armaría cientos de miles de tareas y volvería
 * a barrer el catálogo completo. Después del script:
 *
 *   1. todo `completed` arranca en `NULL` (nunca),
 *   2. los tipos con cadencia cold la reciben,
 *   3. los anime del hot set reciben su cadencia airing, escalonada.
 */
import { closeDb, pool } from '../libs/db.js'

const dryRun = process.argv.includes('--dry-run')

const NULL_ALL = `
  UPDATE ingest.task
  SET refresh_after = NULL, updated_at = now()
  WHERE status = 'completed' AND refresh_after IS NOT NULL
`

const APPLY_COLD = `
  UPDATE ingest.task t
  SET refresh_after = now() + (p.refresh_interval_seconds * interval '1 second'),
      updated_at = now()
  FROM ingest.task_policy p
  WHERE t.source = p.source
    AND t.task_type = p.task_type
    AND t.status = 'completed'
    AND p.refresh_interval_seconds IS NOT NULL
`

const APPLY_HOT = `
  WITH hot AS (
    SELECT mal_id FROM anime
    WHERE status = 'Currently Airing'
       OR (status = 'Not yet aired'
           AND (aired_from IS NULL OR aired_from <= now() + interval '30 days'))
       OR (aired_to IS NOT NULL AND aired_to >= now() - interval '7 days')
  )
  UPDATE ingest.task t
  SET refresh_after = now() + (random() * interval '6 hours'),
      updated_at = now()
  FROM hot h, ingest.task_policy p
  WHERE t.status = 'completed'
    AND t.source = p.source
    AND t.task_type = p.task_type
    AND p.refresh_interval_airing_seconds IS NOT NULL
    AND (
      ((t.payload->>'animeId') ~ '^[0-9]+$' AND (t.payload->>'animeId')::int = h.mal_id)
      OR ((t.payload->>'anime_id') ~ '^[0-9]+$' AND (t.payload->>'anime_id')::int = h.mal_id)
    )
`

const main = async () => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const hot = await client.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM anime
      WHERE status = 'Currently Airing'
         OR (status = 'Not yet aired'
             AND (aired_from IS NULL OR aired_from <= now() + interval '30 days'))
         OR (aired_to IS NOT NULL AND aired_to >= now() - interval '7 days')
    `)
    console.log(`🔥 Hot set: ${hot.rows[0]?.count ?? 0} anime`)

    const cleared = await client.query(NULL_ALL)
    console.log(`1/3 refresh_after limpiado: ${cleared.rowCount ?? 0} tareas`)

    const cold = await client.query(APPLY_COLD)
    console.log(`2/3 cadencia cold aplicada: ${cold.rowCount ?? 0} tareas`)

    const airing = await client.query(APPLY_HOT)
    console.log(`3/3 cadencia airing aplicada: ${airing.rowCount ?? 0} tareas`)

    const due = await client.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM ingest.task
      WHERE status = 'completed' AND refresh_after IS NOT NULL
        AND refresh_after <= now()
    `)
    console.log(`⏰ Vencidas ahora mismo: ${due.rows[0]?.count ?? 0}`)

    if (dryRun) {
      await client.query('ROLLBACK')
      console.log('🧪 DRY-RUN: ROLLBACK (nada se escribió)')
    } else {
      await client.query('COMMIT')
      console.log('✅ Normalización aplicada')
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

try {
  await main()
} catch (error) {
  console.error('Fatal normalizeRefresh:', error)
  process.exitCode = 1
} finally {
  await closeDb()
}
