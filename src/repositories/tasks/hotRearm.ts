import {
  HOT_REARM_BACKOFF_HOURS,
  HOT_REARM_LIMIT,
} from '../../config/incremental.js'
import { db } from '../../libs/db.js'
import {
  episodeKindsFor,
  hotTaskTypes,
  rearmHotSql,
  refreshEpisodePayloadSql,
  seedEpisodeTasksSql,
} from './hotRearmSql.js'

export interface HotRearmResult {
  payloads: number
  seeded: number
  rearmed: number
}

/**
 * Re-armado hot (S9), en orden: (1) payload de episodios al id externo
 * vigente, (2) siembra de la tarea de episodios que falta, (3) re-armado de lo
 * que la cadencia normal no tomaría. Idempotente: una segunda pasada no toca
 * nada nuevo.
 */
export const rearmHotTasks = async (
  source?: string,
  limit = HOT_REARM_LIMIT
): Promise<HotRearmResult> => {
  const result: HotRearmResult = { payloads: 0, seeded: 0, rearmed: 0 }

  for (const kind of episodeKindsFor(source)) {
    const refreshed = await db.execute(refreshEpisodePayloadSql(kind))
    result.payloads += refreshed.rowCount ?? 0
    const seeded = await db.execute(seedEpisodeTasksSql(kind))
    result.seeded += seeded.rowCount ?? 0
  }

  const types = hotTaskTypes()
  if (types.length > 0 && limit > 0) {
    const rearmed = await db.execute(
      rearmHotSql({ source, types, limit, backoffHours: HOT_REARM_BACKOFF_HOURS })
    )
    result.rearmed = rearmed.rowCount ?? 0
  }

  return result
}
