import { PgDialect } from 'drizzle-orm/pg-core'
import { HOT_ANIME_IDS_SQL, taskAnimeIdText } from './animeSets.js'

/**
 * SQL de `incremental:normalize` que depende del hot set. Usa el mismo
 * conjunto que la completitud y el re-armado (`animeSets.ts`, ventana de
 * cierre de 14 días): una copia propia lo haría divergir.
 */

/** `SELECT mal_id FROM anime WHERE …` (sin parámetros: todo es `sql.raw`). */
const HOT_SET = new PgDialect().sqlToQuery(HOT_ANIME_IDS_SQL).sql

export const HOT_COUNT_SQL = `
  SELECT count(*)::text AS count FROM (${HOT_SET}) hot
`

export const APPLY_HOT_SQL = `
  WITH hot AS (${HOT_SET})
  UPDATE ingest.task t
  SET refresh_after = now() + (random() * interval '6 hours'),
      priority = 20,
      updated_at = now()
  FROM hot h, ingest.task_policy p
  WHERE t.status = 'completed'
    AND t.source = p.source
    AND t.task_type = p.task_type
    AND p.refresh_interval_airing_seconds IS NOT NULL
    AND ${taskAnimeIdText('t')} = h.mal_id
`

/**
 * Prioridad por urgencia, **sin importar el estado**: una tarea de un anime en
 * emisión que quedó `pending` por un timeout en la corrida anterior sigue
 * siendo urgente y no puede quedar detrás de los huecos de relleno.
 */
export const PRIORITIZE_AIRING_SQL = `
  WITH hot AS (${HOT_SET})
  UPDATE ingest.task t
  SET priority = 20
  FROM hot h
  WHERE ${taskAnimeIdText('t')} = h.mal_id
`
