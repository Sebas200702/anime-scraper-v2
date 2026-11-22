import { sql, type SQL } from 'drizzle-orm'
import { INCREMENTAL_GROUPS } from '../../config/incremental.js'
import { INCONSISTENT_ANIME_WHERE, taskAnimeId } from './animeSets.js'

/**
 * Vistas de diagnóstico del reporte de frescura (S9). Solo lectura: el script
 * las corre dentro de una transacción `READ ONLY`.
 */
export interface StalenessView {
  title: string
  query: SQL
}

const WATCHED_TYPES = sql.raw(
  `'anime_mal_details_hydration', 'anime_episodes_hydration', 'tvdb_episodes_hydration'`
)

const hotSources = sql.join(
  INCREMENTAL_GROUPS.hot.map((source) => sql`${source}`),
  sql`, `
)

export const STALENESS_VIEWS: StalenessView[] = [
  {
    title: 'A · estado inconsistente con las fechas',
    query: sql`
      SELECT mal_id, title, status, aired_from, aired_to
      FROM anime
      WHERE ${INCONSISTENT_ANIME_WHERE}
      ORDER BY coalesce(aired_to, aired_from) ASC
      LIMIT 200
    `,
  },
  {
    title: 'B · cola de ficha MAL + episodios para esos anime',
    query: sql`
      SELECT a.mal_id, a.status AS anime_status, t.source, t.task_type,
             t.status, t.priority, t.attempts,
             (t.refresh_after IS NULL) AS null_refresh, t.refresh_after,
             t.last_scraped_at, t.skip_reason, left(t.last_error, 120) AS last_error,
             t.payload::text AS payload
      FROM anime a
      LEFT JOIN ingest.task t
        ON t.task_type IN (${WATCHED_TYPES}) AND ${taskAnimeId('t')} = a.mal_id
      -- Subconsulta: el predicado no va calificado y ingest.task también tiene status.
      WHERE a.mal_id IN (SELECT mal_id FROM anime WHERE ${INCONSISTENT_ANIME_WHERE})
      ORDER BY a.mal_id, t.task_type
      LIMIT 600
    `,
  },
  {
    title: 'C · salud de la cola por fuente hot',
    query: sql`
      SELECT source,
             count(*) FILTER (WHERE status = 'pending')::int AS pending,
             count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
             count(*) FILTER (WHERE status = 'completed')::int AS completed,
             count(*) FILTER (WHERE status = 'completed' AND refresh_after IS NULL)::int AS completed_null_refresh,
             count(*) FILTER (WHERE status = 'dead_letter')::int AS dead_letter,
             count(*) FILTER (WHERE status = 'skipped')::int AS skipped,
             min(scheduled_at) FILTER (WHERE status = 'pending') AS oldest_pending,
             max(last_scraped_at) AS last_success
      FROM ingest.task
      WHERE source IN (${hotSources})
      GROUP BY source
      ORDER BY source
    `,
  },
  {
    title: 'D · corridas recientes (7 días) por modo y grupo',
    query: sql`
      SELECT mode,
             CASE WHEN notes ~ '^\\s*\\{' THEN notes::jsonb->>'group' END AS run_group,
             count(*)::int AS runs,
             count(*) FILTER (WHERE finished_at IS NULL)::int AS unfinished,
             max(started_at) AS last_started,
             max(finished_at) AS last_finished,
             sum(tasks_processed)::int AS processed,
             sum(tasks_dead_lettered)::int AS dead_lettered
      FROM ingest.run
      WHERE started_at > now() - interval '7 days'
      GROUP BY 1, 2
      ORDER BY last_started DESC
    `,
  },
]
