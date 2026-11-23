/**
 * Piezas del fetch por lotes del `TaskDispatcher` (T11, S6, L19): un request
 * del proveedor hidrata N tareas del mismo tipo y cada una conserva su propio
 * done/error.
 */
import type { DispatcherTask } from './taskDispatcher.js'

/** Resultado de un fetch por lotes: dato o `Error` por id de tarea. */
export type BatchResults<T> = Map<number, T | Error>

/** Lo que dejó el request del grupo: resultados o el fallo del request. */
export interface BatchOutcome<T> {
  results?: BatchResults<T>
  failure?: { error: unknown }
}

/**
 * Saca de la cola la primera tarea y hasta `size - 1` más **del mismo tipo**
 * (en orden de cola). Las de otro tipo se quedan donde estaban.
 */
export const takeGroup = (
  queue: DispatcherTask[],
  size: number
): DispatcherTask[] => {
  const head = queue.shift()
  if (!head) return []
  const group = [head]
  for (let i = 0; i < queue.length && group.length < size; ) {
    if (queue[i]?.taskType === head.taskType) group.push(...queue.splice(i, 1))
    else i++
  }
  return group
}

/**
 * Resultado de una tarea del grupo: el fallo del request entero, una entrada
 * ausente (error solo de esa tarea), su `Error` o su dato.
 */
export const resolveBatchEntry = <T>(
  task: DispatcherTask,
  outcome: BatchOutcome<T>
): T => {
  if (outcome.failure) throw outcome.failure.error
  if (!outcome.results?.has(task.id))
    throw new Error(`Batch result missing for task ${task.id}`)
  const value = outcome.results.get(task.id)
  if (value instanceof Error) throw value
  return value as T
}
