/**
 * Reconstruye el historial de tareas de `jikanRelations` para el catálogo que
 * ya está ingerido.
 *
 *   bun run db:seed-task-history [--dry-run]
 *
 * Por qué existe: en el backfill las tareas de `jikanRelations` se limpiaron de
 * la cola (la DB local no tiene ninguna), pero sus datos **sí** están en el
 * catálogo (géneros, reparto, staff). Sin este paso, el primer `--discover`
 * crearía 91k tareas `pending` y volvería a bajar todo el catálogo.
 *
 * Regla:
 *   - anime con datos → tarea `completed` con el refresh de su política,
 *   - anime con un hueco real → tarea `pending` (se rellena, no se re-barre).
 */
import { closeDb, pool } from '../libs/db.js'

const dryRun = process.argv.includes('--dry-run')

const PLAN_CTE = `
  WITH hot AS (
    SELECT mal_id,
           (status = 'Currently Airing'
            OR (status = 'Not yet aired'
                AND (aired_from IS NULL OR aired_from <= now() + interval '30 days'))
            OR (aired_to IS NOT NULL AND aired_to >= now() - interval '7 days')) AS is_hot
    FROM anime
  ), coverage AS (
    SELECT a.mal_id,
           EXISTS (SELECT 1 FROM anime_genre g WHERE g.anime_id = a.mal_id) AS has_details,
           EXISTS (SELECT 1 FROM anime_character c WHERE c.anime_id = a.mal_id) AS has_characters,
           EXISTS (SELECT 1 FROM anime_staff s WHERE s.anime_id = a.mal_id) AS has_staff
    FROM anime a
  ), plan AS (
    SELECT c.mal_id, h.is_hot, 'anime_details_hydration'::text AS task_type,
           'anime_details_' || c.mal_id AS entity_id, c.has_details AS covered
    FROM coverage c JOIN hot h USING (mal_id)
    UNION ALL
    SELECT c.mal_id, h.is_hot, 'anime_characters_hydration',
           'anime_characters_' || c.mal_id, c.has_characters
    FROM coverage c JOIN hot h USING (mal_id)
    UNION ALL
    SELECT c.mal_id, h.is_hot, 'anime_staff_hydration',
           'anime_staff_' || c.mal_id, c.has_staff
    FROM coverage c JOIN hot h USING (mal_id)
  )
`

const INSERT = `
  ${PLAN_CTE}
  INSERT INTO ingest.task (
    source, task_type, entity_id, payload, priority, status, attempts,
    last_scraped_at, refresh_after
  )
  SELECT 'jikanRelations',
         p.task_type,
         p.entity_id,
         jsonb_build_object('animeId', p.mal_id),
         -- Los huecos van al final de la cola: primero la frescura del airing.
         CASE WHEN p.covered THEN 20 ELSE 1 END,
         CASE WHEN p.covered THEN 'completed' ELSE 'pending' END,
         CASE WHEN p.covered THEN 1 ELSE 0 END,
         CASE WHEN p.covered THEN now() END,
         CASE
           WHEN NOT p.covered THEN NULL
           WHEN NOT p.is_hot THEN NULL
           WHEN p.task_type = 'anime_details_hydration'
             THEN now() + (random() * interval '6 hours')
           ELSE now() + interval '180 days' + (random() * interval '1 day')
         END
  FROM plan p
  ON CONFLICT (source, task_type, entity_id) DO NOTHING
`

const main = async () => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const stats = await client.query<{
      task_type: string
      total: string
      covered: string
      gaps: string
    }>(`
      ${PLAN_CTE}
      SELECT task_type,
             count(*)::text AS total,
             count(*) FILTER (WHERE covered)::text AS covered,
             count(*) FILTER (WHERE NOT covered)::text AS gaps
      FROM plan GROUP BY 1 ORDER BY 1
    `)

    for (const row of stats.rows) {
      console.log(
        `  ${row.task_type}: ${row.total} (${row.covered} completadas, ${row.gaps} huecos a rellenar)`
      )
    }

    const inserted = await client.query(INSERT)
    console.log(`→ ${inserted.rowCount ?? 0} tareas nuevas de jikanRelations`)

    if (dryRun) {
      await client.query('ROLLBACK')
      console.log('🧪 DRY-RUN: ROLLBACK (nada se escribió)')
    } else {
      await client.query('COMMIT')
      console.log('✅ Historial sembrado')
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
  console.error('Fatal seedTaskHistory:', error)
  process.exitCode = 1
} finally {
  await closeDb()
}
