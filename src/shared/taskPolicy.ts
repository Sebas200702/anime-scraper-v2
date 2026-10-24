import { REFRESH_POLICY, SOURCES } from '../config/sources.js'

export interface PolicySeedRow {
  source: string
  taskType: string
  refreshIntervalSeconds: number | null
  refreshIntervalAiringSeconds: number | null
  maxAttempts: number
  priority: number
}

/** Fuente que declara un taskType (el manager la necesita para el drenado). */
export function sourceOfTaskType(taskType: string): string {
  const found = SOURCES.find((s) => Object.hasOwn(s.tasks, taskType))
  if (!found) throw new Error(`taskType sin fuente en SOURCES: ${taskType}`)
  return found.name
}

/**
 * Filas de `ingest.task_policy` para todos los taskTypes conocidos.
 *
 * `refresh_interval_seconds = null` significa **nunca** (catálogo terminado:
 * no se re-ingesta). `refresh_interval_airing_seconds` solo se siembra en los
 * tipos que dependen de la emisión; el manager elige uno u otro según el hot
 * set (`anime.status = 'Currently Airing'` o ventana de cierre).
 */
export function buildPolicySeedRows(): PolicySeedRow[] {
  return Object.entries(REFRESH_POLICY).map(([taskType, policy]) => ({
    source: sourceOfTaskType(taskType),
    taskType,
    refreshIntervalSeconds: policy.cold,
    refreshIntervalAiringSeconds: policy.hot,
    maxAttempts: 3,
    priority: 0,
  }))
}
