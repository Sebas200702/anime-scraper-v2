import { sql } from 'drizzle-orm'
import { CLOSING_WINDOW_DAYS } from '../../config/incremental.js'

/**
 * Conjuntos de anime del Modo B (S9), como fragmentos SQL puros sobre `anime`.
 *
 * Un solo origen para el hot set de la completitud (`hotAnimeIds`) y para el
 * re-armado (`rearmHotTasks`): si difirieran, una tarea re-armada se
 * completaría con `refresh_after = NULL` y se re-armaría en cada drain.
 */

/** Hot: en emisión, por estrenarse (≤ 30 días) o terminado hace poco. */
export const HOT_ANIME_WHERE = sql.raw(
  `status = 'Currently Airing'` +
    ` OR (status = 'Not yet aired' AND (aired_from IS NULL OR aired_from <= now() + interval '30 days'))` +
    ` OR (aired_to IS NOT NULL AND aired_to >= now() - interval '${CLOSING_WINDOW_DAYS} days')`
)

/** Estado que contradice las fechas: solo una ficha fresca de MAL lo corrige. */
export const INCONSISTENT_ANIME_WHERE = sql.raw(
  `(status = 'Currently Airing' AND aired_to IS NOT NULL AND aired_to < now() - interval '7 days')` +
    ` OR (status = 'Not yet aired' AND aired_from IS NOT NULL AND aired_from <= now())`
)

export const SELECTED_ANIME_WHERE = sql`(${HOT_ANIME_WHERE}) OR (${INCONSISTENT_ANIME_WHERE})`

export const HOT_ANIME_IDS_SQL = sql`SELECT mal_id FROM anime WHERE ${SELECTED_ANIME_WHERE}`

/** `mal_id` del anime de una tarea según su payload (`animeId` o `anime_id`). */
export const taskAnimeIdText = (alias: string): string =>
  `CASE WHEN (${alias}.payload->>'animeId') ~ '^[0-9]+$' THEN (${alias}.payload->>'animeId')::int` +
  ` WHEN (${alias}.payload->>'anime_id') ~ '^[0-9]+$' THEN (${alias}.payload->>'anime_id')::int END`

export const taskAnimeId = (alias: string) => sql.raw(taskAnimeIdText(alias))
