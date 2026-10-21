import { DEFAULT_REFRESH_SECONDS, SOURCES } from '../config/sources.js'

export interface PolicySeedRow {
  source: string
  taskType: string
  refreshIntervalSeconds: number
  refreshIntervalAiringSeconds: number | null
  maxAttempts: number
  priority: number
}

/**
 * Filas de `ingest.task_policy` para todos los taskTypes conocidos.
 *
 * La cadencia es **dato, no código**: `GenericManager` la lee al completar cada
 * tarea (`refreshSecondsFor` con fallback a `DEFAULT_REFRESH_SECONDS`) y el
 * dashboard la edita sin deploy. `airing` queda en `null` a propósito: el
 * refresh sensible a emisión necesita la condición "hot"
 * (`anime.status = 'Currently Airing'`) y eso es trabajo del Modo B; sembrar
 * un intervalo airing sin esa condición refrescaría el catálogo terminado a
 * ritmo de emisión y quemaría cuota.
 */
export function buildPolicySeedRows(): PolicySeedRow[] {
  const sourceOf = (taskType: string): string => {
    const found = SOURCES.find((s) => Object.hasOwn(s.tasks, taskType))
    if (!found) throw new Error(`taskType sin fuente en SOURCES: ${taskType}`)
    return found.name
  }

  return Object.entries(DEFAULT_REFRESH_SECONDS).map(
    ([taskType, refreshIntervalSeconds]) => ({
      source: sourceOf(taskType),
      taskType,
      refreshIntervalSeconds,
      refreshIntervalAiringSeconds: null,
      maxAttempts: 3,
      priority: 0,
    })
  )
}
