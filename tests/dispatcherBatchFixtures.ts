import { spyOn } from 'bun:test'
import { RateGate } from '../src/core/rateGate.js'
import {
  type DispatchHooks,
  type DispatcherTask,
  TaskDispatcher,
} from '../src/core/taskDispatcher.js'

/** Fixtures de `dispatcherBatch.test.ts` (T11, S6, L19). */
export const A = 'media_anilist_details_hydration'
export const t = (id: number, taskType = A): DispatcherTask => ({
  id,
  taskType,
})
const limits = {
  host: 'graphql.anilist.co',
  limits: { perSecond: 0, perMinute: 1e9 },
}
const time = () => {
  let now = 1_000_000
  return { now: () => now, sleep: async (ms: number) => void (now += ms) }
}

export const setup = (
  extra: {
    fetchBatchSize?: number
    maxConsecutiveFailures?: number
    deadline?: number
  } = {}
) => {
  const gate = new RateGate(time())
  const acquire = spyOn(gate, 'acquire')
  const dispatcher = new TaskDispatcher({
    maxInFlight: 1,
    gate,
    acquireProxy: () => undefined,
    limitsFor: () => limits,
    ...extra,
  })
  return { gate, acquire, dispatcher }
}

export const recorder = <T>(runBatch?: DispatchHooks<T>['runBatch']) => {
  const log = {
    runs: [] as number[],
    batches: [] as number[][],
    done: [] as [number, T][],
    errors: [] as [number, unknown][],
  }
  const hooks: DispatchHooks<T> = {
    run: async (task) => {
      log.runs.push(task.id)
      return `single-${task.id}` as T
    },
    runBatch: runBatch
      ? async (tasks, proxy) => {
          log.batches.push(tasks.map((task) => task.id))
          return runBatch(tasks, proxy)
        }
      : undefined,
    onDone: (task, data) => void log.done.push([task.id, data]),
    onError: (task, error) => void log.errors.push([task.id, error]),
  }
  return { log, hooks }
}

export const ok = async (tasks: DispatcherTask[]) =>
  new Map<number, string | Error>(
    tasks.map((task) => [task.id, `raw-${task.id}`])
  )
