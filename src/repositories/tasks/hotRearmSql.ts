import { sql, type SQL } from 'drizzle-orm'
import { REFRESH_POLICY, type RefreshPolicy } from '../../config/sources.js'
import {
  CLOSING_WINDOW_SECONDS,
  HOT_ANIME_IDS_SQL,
  closingRefreshDue,
  taskAnimeId,
} from './animeSets.js'

/**
 * SQL puro del re-armado hot (S9). Sin conexión: `hotRearm.ts` lo ejecuta y
 * los tests lo renderizan.
 */

export interface HotTaskType {
  taskType: string
  hotSeconds: number
}

/** Tipos con cadencia hot (sensibles a emisión) según la política de código. */
export const hotTaskTypes = (
  policy: Record<string, RefreshPolicy> = REFRESH_POLICY
): HotTaskType[] =>
  Object.entries(policy)
    .filter(([, p]) => p.hot !== null)
    .map(([taskType, p]) => ({ taskType, hotSeconds: p.hot as number }))

/** Pasado al dejar una tarea hot en `pending`: el drain la toma primero. */
export const HOT_PRIORITY = 20

/**
 * Re-arma tareas de anime hot o inconsistente que la cadencia normal no
 * tomaría: `completed` con `refresh_after` NULL (se completó en frío), vencido
 * o más lejos que el intervalo hot, `dead_letter`/`skipped` tras un backoff y,
 * para tipos con intervalo hot mayor que la ventana de cierre (reparto, 90 d),
 * una pasada final si el anime terminó y la tarea no se scrapeó después.
 * `pending` e `in_progress` nunca se eligen ⇒ idempotente.
 */
export const rearmHotSql = (opts: {
  source?: string
  types: HotTaskType[]
  limit: number
  backoffHours: number
}): SQL => {
  const values = sql.join(
    opts.types.map((t) => sql`(${t.taskType}::text, ${t.hotSeconds}::int)`),
    sql`, `
  )
  const sourceFilter = opts.source ? sql`AND t.source = ${opts.source}` : sql``
  return sql`
    WITH code_policy(task_type, hot_seconds) AS (VALUES ${values}),
    due AS (
      SELECT t.id FROM ingest.task t
      JOIN code_policy c ON c.task_type = t.task_type
      LEFT JOIN ingest.task_policy tp
        ON tp.source = t.source AND tp.task_type = t.task_type
      CROSS JOIN LATERAL (
        SELECT CASE WHEN tp.source IS NULL THEN c.hot_seconds ELSE tp.refresh_interval_airing_seconds END AS hot_seconds
      ) p
      WHERE p.hot_seconds IS NOT NULL ${sourceFilter}
        AND ${taskAnimeId('t')} IN (${HOT_ANIME_IDS_SQL})
        AND (
          (t.status = 'completed' AND (t.refresh_after IS NULL OR t.refresh_after <= now() OR t.refresh_after > now() + p.hot_seconds * interval '1 second'))
          OR (t.status = 'completed' AND p.hot_seconds > ${sql.raw(String(CLOSING_WINDOW_SECONDS))} AND ${closingRefreshDue('t')})
          OR (t.status IN ('dead_letter', 'skipped') AND t.updated_at < now() - (${opts.backoffHours} * interval '1 hour'))
        )
      ORDER BY t.updated_at ASC
      LIMIT ${opts.limit}
      FOR UPDATE OF t SKIP LOCKED
    )
    UPDATE ingest.task t
    SET status = 'pending', scheduled_at = now(), priority = ${sql.raw(String(HOT_PRIORITY))}, attempts = 0, leased_until = NULL, updated_at = now()
    FROM due
    WHERE t.id = due.id AND t.status <> 'in_progress'
  `
}

/** Tareas de episodios cuyo payload depende de `anime_external_ids`. */
export interface EpisodeKind {
  source: string
  taskType: string
  /** Clave del id externo en el payload y su columna en `anime_external_ids`. */
  key: string
  column: string
  /** Clave del anime en el payload. */
  animeKey: string
  entityPrefix: string
  /** Columna de `anime_external_ids` que completa el `entity_id`. */
  entityColumn: string
}

export const EPISODE_KINDS = {
  animeEpisodes: {
    source: 'animeEpisodes',
    taskType: 'anime_episodes_hydration',
    key: 'kitsu_id',
    column: 'kitsu_id',
    animeKey: 'anime_id',
    entityPrefix: 'anime_episodes_',
    entityColumn: 'anime_id',
  },
  tvdbEpisodes: {
    source: 'tvdbEpisodes',
    taskType: 'tvdb_episodes_hydration',
    key: 'tvdbId',
    column: 'tvdb_id',
    animeKey: 'animeId',
    entityPrefix: 'tvdb_eps_',
    entityColumn: 'tvdb_id',
  },
} as const satisfies Record<string, EpisodeKind>

export const episodeKindsFor = (source?: string): EpisodeKind[] =>
  Object.values(EPISODE_KINDS).filter((k) => !source || k.source === source)

/**
 * Lleva el id externo vigente al payload (era una foto del momento de la
 * siembra) y re-arma la tarea: con otro id, lo ya traído no vale.
 */
export const refreshEpisodePayloadSql = (k: EpisodeKind): SQL => sql`
    UPDATE ingest.task t
    SET payload = ${sql.raw(`jsonb_set(coalesce(t.payload, '{}'::jsonb), '{${k.key}}', to_jsonb(x.${k.column}))`)},
        status = 'pending', scheduled_at = now(), priority = ${sql.raw(String(HOT_PRIORITY))}, attempts = 0,
        skip_reason = NULL, leased_until = NULL, updated_at = now()
    FROM anime_external_ids x
    WHERE ${sql.raw(`t.source = '${k.source}' AND t.task_type = '${k.taskType}'`)}
      AND t.status <> 'in_progress'
      AND x.anime_id = ${taskAnimeId('t')}
      AND ${sql.raw(`x.${k.column} IS NOT NULL AND (t.payload->>'${k.key}') IS DISTINCT FROM x.${k.column}::text`)}
      AND x.anime_id IN (${HOT_ANIME_IDS_SQL})
  `

/** Siembra la tarea de episodios que falta para un anime hot con id externo. */
export const seedEpisodeTasksSql = (k: EpisodeKind): SQL => sql`
    INSERT INTO ingest.task (source, task_type, entity_id, payload, priority, status)
    SELECT ${sql.raw(`'${k.source}', '${k.taskType}', '${k.entityPrefix}' || x.${k.entityColumn},
           jsonb_build_object('${k.key}', x.${k.column}, '${k.animeKey}', x.anime_id),
           ${HOT_PRIORITY}, 'pending'`)}
    FROM anime_external_ids x
    WHERE ${sql.raw(`x.${k.column} IS NOT NULL`)}
      AND NOT EXISTS (
        SELECT 1 FROM ingest.task e
        WHERE ${sql.raw(`e.source = '${k.source}' AND e.task_type = '${k.taskType}'`)}
          AND ${taskAnimeId('e')} = x.anime_id
      )
      AND x.anime_id IN (${HOT_ANIME_IDS_SQL})
    ON CONFLICT (source, task_type, entity_id) DO NOTHING
  `
