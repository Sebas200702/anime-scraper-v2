import { describe, expect, test } from 'bun:test'
import { batchKeyOf, processBatchResults } from '../src/core/batchResults.js'
import { TaskContinuation } from '../src/shared/taskContinuation.js'

/** T11 (S6, L19): el manager procesa cada crudo del lote con su tarea. */
const A = 'media_anilist_details_hydration'

describe('processBatchResults', () => {
  test('procesa cada crudo con su tarea; Error, ausencia y continuación pasan; un throw del processor es Error', async () => {
    const tasks = [1, 2, 3, 4, 5].map((id) => ({ id, taskType: A }))
    const cont = new TaskContinuation('tramo')
    const raw = new Map<number, unknown>([
      [1, 'a'],
      [2, new Error('x')],
      [4, cont],
      [5, 'bad'],
    ])
    const out = await processBatchResults(
      tasks,
      raw,
      async (value: unknown, task: { id: number }) => {
        if (value === 'bad') throw new Error('process failed')
        return `${value}:${task.id}`
      }
    )
    expect(out.get(1)).toBe('a:1')
    expect((out.get(2) as Error).message).toBe('x')
    expect(out.has(3)).toBe(false)
    expect(out.get(4)).toBe(cont)
    expect((out.get(5) as Error).message).toBe('process failed')
  })
})

describe('batchKeyOf', () => {
  test('taskType + mediaType del payload (vacío si no hay)', () => {
    expect(batchKeyOf({ taskType: A, payload: { mediaType: 'MANGA' } })).toBe(
      `${A}|MANGA`
    )
    expect(batchKeyOf({ taskType: A, payload: null })).toBe(`${A}|`)
  })
})
