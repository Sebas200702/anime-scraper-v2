/**
 * Mapeo por tarea del resultado de un fetch por lotes (T11, S6, L19): el
 * processor corre con **su** tarea, igual que en el camino de una tarea.
 */
import { capitalize } from '../shared/parsers.js'
import { TaskContinuation } from '../shared/taskContinuation.js'
import type { BatchResults } from './batchDispatch.js'

/**
 * Aplica `process` a cada crudo. Un `Error` o una `TaskContinuation` pasan tal
 * cual; una tarea sin entrada sigue sin entrada (el dispatcher la falla); si el
 * processor lanza, el error es solo de esa tarea.
 */
export const processBatchResults = async <Task extends { id: number }>(
  tasks: Task[],
  raw: Map<number, unknown>,
  process: (value: any, task: Task) => unknown
): Promise<BatchResults<unknown>> => {
  const out: BatchResults<unknown> = new Map()
  for (const task of tasks) {
    if (!raw.has(task.id)) continue
    const value = raw.get(task.id)
    if (value instanceof Error || value instanceof TaskContinuation) {
      out.set(task.id, value)
      continue
    }
    try {
      out.set(task.id, await process(value, task))
    } catch (error) {
      out.set(
        task.id,
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }
  return out
}

/**
 * Fetch por lotes de una fuente (T11): `fetch{Entity}Batch(tasks, proxy)` y
 * `process{Entity}` por tarea. Sin fetcher por lotes es un error de config.
 */
export const runBatchFetch = async <Task extends { id: number }>(
  modules: { services: any; processors: any },
  where: { entity: string; source: string },
  tasks: Task[],
  proxyUrl: string | undefined
): Promise<BatchResults<unknown>> => {
  const entity = capitalize(where.entity)
  const fetchBatch = modules.services[`fetch${entity}Batch`]
  if (typeof fetchBatch !== 'function')
    throw new Error(
      `Missing fetch${entity}Batch in services/${where.source}.js`
    )
  const processFn = modules.processors[`process${entity}`]
  if (typeof processFn !== 'function')
    throw new Error(`Missing process${entity} in processors/${where.source}.js`)
  return processBatchResults(
    tasks,
    await fetchBatch(tasks, proxyUrl),
    processFn
  )
}
