import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { getSourceConfig } from '../src/config/sources.js'
import { GenericManager } from '../src/core/genericManager.js'
import { proxyManager } from '../src/core/proxyManager.js'
import {
  ALL,
  M,
  castRows,
  cleanup,
  parkOthers,
  reschedule,
  seed,
  tasks,
} from './anilistMediaBatchDb.js'
import {
  MAL_OFFSET,
  requests,
  resetScript,
  script,
  startAnilist,
  stopAnilist,
} from './anilistMediaBatchFixtures.js'

/**
 * T11 (S6, L19) contra Postgres (RUN_DB_TESTS=1): `anilistMedia` por lotes por
 * el GenericManager real, frente al camino de un medio. AniList simulado.
 */
const RUN = Boolean(process.env.RUN_DB_TESTS)
const drain = (fetchBatchSize: number | undefined, maxTasks?: number) =>
  new GenericManager({ ...getSourceConfig('anilistMedia'), fetchBatchSize })
    .useIncremental({ maxTasks })
    .init()
let original: typeof proxyManager.proxies = []
let restore: () => Promise<void> = async () => {}

describe.skipIf(!RUN)('anilistMedia · lotes de AniList (Postgres)', () => {
  beforeAll(async () => {
    await startAnilist()
    proxyManager.init()
    original = proxyManager.proxies
    proxyManager.proxies = []
    restore = await parkOthers()
    await cleanup()
  })

  afterAll(async () => {
    await cleanup()
    await restore()
    proxyManager.proxies = original
    stopAnilist()
  })

  test('10 tareas en un request, mismas filas que el camino de un medio, presupuesto por tarea', async () => {
    // Referencia: el camino de un medio (sin fetchBatchSize) para M(1).
    await seed([M(1)])
    await drain(undefined)
    expect(requests.map((r) => r.variables.id)).toEqual([M(1) + MAL_OFFSET])
    const single = await castRows(M(1))
    expect(single.cast).toHaveLength(1)
    expect(single.links).toHaveLength(1)

    await cleanup()
    resetScript()
    await seed(ALL)
    const summary = await drain(10, 10)
    // Un request con 10 alias; el presupuesto (10) cuenta tareas, no requests.
    expect(requests).toHaveLength(1)
    expect(Object.keys(requests[0]!.variables)).toHaveLength(20)
    expect(summary).toMatchObject({ processed: 10, failed: 0 })
    expect(await castRows(M(1))).toEqual(single)
    for (const id of ALL.slice(0, 10))
      expect((await castRows(id)).cast).toHaveLength(1)
    expect((await tasks()).map((t) => t.status)).toEqual([
      ...Array(10).fill('completed'),
      'pending',
      'pending',
    ])
  })

  test('un 429 falla el grupo y cada tarea se reintenta según sus intentos', async () => {
    resetScript()
    script.batchStatus = 429
    const summary = await drain(10)
    expect(summary).toMatchObject({ processed: 0, failed: 2, retried: 2 })
    expect(summary.byKind).toEqual({ rate_limit: 2 })
    const failed = (await tasks()).slice(10)
    expect(failed.map((t) => [t.status, t.attempts])).toEqual([
      ['pending', 1],
      ['pending', 1],
    ])
    expect(failed.every((t) => Boolean(t.last_error))).toBe(true)
  })

  test('un alias null es skip (not_found) y no afecta a su vecino', async () => {
    resetScript()
    script.nulls = [M(12) + MAL_OFFSET]
    await reschedule()
    await drain(10)
    expect(requests).toHaveLength(1)
    const [eleven, twelve] = (await tasks()).slice(10)
    expect(eleven).toMatchObject({ status: 'completed', attempts: 2 })
    expect(twelve).toMatchObject({
      status: 'skipped',
      attempts: 2,
      skip_reason: 'anilist:not_found',
    })
    expect((await castRows(M(11))).cast).toHaveLength(1)
    expect((await castRows(M(12))).cast).toHaveLength(0)
  })
})
