import { describe, expect, spyOn, test } from 'bun:test'
import { FetchError } from '../src/libs/httpError.js'
import { SkippedTaskError } from '../src/libs/skippedTaskError.js'
import { ok, recorder, setup, t } from './dispatcherBatchFixtures.js'

/** T11 (S6, L19): el dispatcher agrupa N tareas por request con `fetchBatchSize`. */
describe('TaskDispatcher · fetchBatchSize', () => {
  test('agrupa solo tareas del mismo tipo, un acquire del gate por grupo, done por tarea', async () => {
    const { acquire, dispatcher } = setup({ fetchBatchSize: 2 })
    const { log, hooks } = recorder(ok)
    const summary = await dispatcher.drain(
      [t(1), t(2, 'other'), t(3), t(4), t(5, 'other')],
      hooks
    )
    expect(log.batches).toEqual([[1, 3], [2, 5], [4]])
    expect(acquire).toHaveBeenCalledTimes(3)
    expect(log.runs).toEqual([])
    expect(log.done).toEqual([
      [1, 'raw-1'],
      [3, 'raw-3'],
      [2, 'raw-2'],
      [5, 'raw-5'],
      [4, 'raw-4'],
    ])
    expect(summary).toMatchObject({
      processed: 5,
      failed: 0,
      unprocessedIds: [],
      aborted: false,
    })
  })

  test('una entrada ausente o un Error falla solo su tarea; skipped sigue siendo skipped', async () => {
    const { dispatcher } = setup({ fetchBatchSize: 10 })
    const { log, hooks } = recorder(
      async () =>
        new Map<number, string | Error>([
          [1, 'raw-1'],
          [3, new SkippedTaskError('anilist:not_found')],
          [4, new Error('AniList: boom')],
        ])
    )
    const summary = await dispatcher.drain([t(1), t(2), t(3), t(4)], hooks)
    expect(log.done).toEqual([[1, 'raw-1']])
    expect(log.errors.map(([id, e]) => [id, (e as Error).message])).toEqual([
      [2, 'Batch result missing for task 2'],
      [3, 'Skipped: anilist:not_found'],
      [4, 'AniList: boom'],
    ])
    expect(summary).toMatchObject({
      processed: 1,
      failed: 3,
      byKind: { unknown: 2, skipped: 1 },
    })
  })

  test('un 429 del grupo falla cada tarea por onError y pausa la clave; el breaker cuenta un request', async () => {
    const { gate, dispatcher } = setup({
      fetchBatchSize: 3,
      maxConsecutiveFailures: 2,
    })
    const limit = new FetchError({
      kind: 'rate_limit',
      url: 'https://graphql.anilist.co',
      status: 429,
      retryAfterMs: 60_000,
    })
    const { log, hooks } = recorder(async () => {
      throw limit
    })
    const summary = await dispatcher.drain(
      [1, 2, 3, 4, 5, 6, 7].map((id) => t(id)),
      hooks
    )
    // Dos requests fallidos cortan la fuente; el tercer grupo no sale.
    expect(log.batches).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ])
    expect(log.errors.map(([id, e]) => [id, e === limit])).toEqual(
      [1, 2, 3, 4, 5, 6].map((id) => [id, true])
    )
    expect(summary).toMatchObject({
      processed: 0,
      failed: 6,
      byKind: { rate_limit: 6 },
      aborted: true,
      unprocessedIds: [7],
    })
    expect(gate.snapshot('graphql.anilist.co|direct').pausedMs).toBe(60_000)
  })

  test('el deadline acota el drain entre grupos', async () => {
    let now = 5_000
    const clock = spyOn(Date, 'now').mockImplementation(() => now)
    const { dispatcher } = setup({ fetchBatchSize: 2, deadline: 6_000 })
    const { log, hooks } = recorder(async (tasks) => {
      now = 7_000
      return ok(tasks)
    })
    const summary = await dispatcher.drain([t(1), t(2), t(3), t(4)], hooks)
    expect(log.batches).toEqual([[1, 2]])
    clock.mockRestore()
    expect(summary).toMatchObject({ processed: 2, unprocessedIds: [3, 4] })
  })

  test('PRESERVE: sin fetchBatchSize (o sin runBatch) cada tarea es un run y un acquire', async () => {
    for (const [size, withBatch] of [
      [undefined, true],
      [5, false],
    ] as const) {
      const { acquire, dispatcher } = setup({ fetchBatchSize: size })
      const { log, hooks } = recorder(withBatch ? ok : undefined)
      const summary = await dispatcher.drain([t(1), t(2, 'other'), t(3)], hooks)
      expect(log.batches).toEqual([])
      expect(log.runs).toEqual([1, 2, 3])
      expect(acquire).toHaveBeenCalledTimes(3)
      expect(log.done).toEqual([
        [1, 'single-1'],
        [2, 'single-2'],
        [3, 'single-3'],
      ])
      expect(summary).toMatchObject({ processed: 3, failed: 0 })
    }
  })
})
