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

  // Las re-peticiones pagan el gate real (1/s): ~5 s.
  test('lote de 10 (con > 25 personajes) = mismas filas y estado que el camino de un medio', async () => {
    const big = { [M(1) + MAL_OFFSET]: 60, [M(2) + MAL_OFFSET]: 30 }
    // Referencia: el camino de un medio (sin fetchBatchSize) para M(1) y M(2).
    script.chars = big
    await seed([M(1), M(2)])
    await drain(undefined)
    const ids = requests.map((r) => r.variables.id).sort()
    expect(ids).toEqual([M(1), M(1), M(1), M(2)].map((id) => id + MAL_OFFSET))
    const single = [await castRows(M(1)), await castRows(M(2))]
    const singleStatus = (await tasks()).map((t) => [t.entity_id, t.status])
    expect(single.map((rows) => rows.cast.length)).toEqual([60, 30])

    await cleanup()
    resetScript()
    script.chars = big
    await seed(ALL)
    const summary = await drain(25, 10)
    // Un Page con 10 ids; M(1) y M(2) (> 25) se re-piden por el camino de un
    // medio. El presupuesto (10) cuenta tareas, no requests.
    expect(requests[0]?.variables.ids).toHaveLength(10)
    expect(
      requests
        .slice(1)
        .map((r) => r.variables.id)
        .sort()
    ).toEqual(ids)
    expect(summary).toMatchObject({ processed: 10, failed: 0 })
    expect([await castRows(M(1)), await castRows(M(2))]).toEqual(single)
    const status = await tasks()
    expect(status.slice(0, 2).map((t) => [t.entity_id, t.status])).toEqual(
      singleStatus
    )
    for (const id of ALL.slice(2, 10))
      expect((await castRows(id)).cast).toHaveLength(1)
    expect(status.map((t) => t.status)).toEqual([
      ...Array(10).fill('completed'),
      'pending',
      'pending',
    ])
  }, 30_000)

  test('un 429 falla el grupo y cada tarea se reintenta según sus intentos', async () => {
    resetScript()
    script.batchStatus = 429
    const summary = await drain(25)
    expect(summary).toMatchObject({ processed: 0, failed: 2, retried: 2 })
    expect(summary.byKind).toEqual({ rate_limit: 2 })
    const failed = (await tasks()).slice(10)
    expect(failed.map((t) => [t.status, t.attempts])).toEqual([
      ['pending', 1],
      ['pending', 1],
    ])
    expect(failed.every((t) => Boolean(t.last_error))).toBe(true)
  })

  test('un id ausente de Page es skip (not_found) y no afecta a su vecino', async () => {
    resetScript()
    script.missing = [M(12) + MAL_OFFSET]
    await reschedule()
    await drain(25)
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
