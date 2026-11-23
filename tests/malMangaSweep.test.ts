import { describe, expect, test } from 'bun:test'
import { FetchError } from '../src/libs/httpError.js'
import { SkippedTaskError } from '../src/libs/skippedTaskError.js'
import type { MalMangaNode } from '../src/services/malManga.js'
import {
  type MangaSweepLimits,
  runMangaSweep,
  sweepCursor,
} from '../src/services/malDiscoveryMangaSweep.js'

/**
 * S6 (L9): el barrido del ranking de manga es reanudable. Se guarda cada
 * página al llegar, el cursor (siguiente offset) se persiste tras cada
 * página, un fallo transitorio reintenta esa página con backoff y cada
 * intento tiene un tope de páginas y de tiempo.
 */
const nodes = (offset: number, count: number): MalMangaNode[] =>
  Array.from({ length: count }, (_, i) => ({
    id: offset + i + 1,
    title: `M${offset + i + 1}`,
  }))

const timeout = (offset: number) =>
  new FetchError({
    kind: 'timeout',
    url: `offset=${offset}`,
    message: 'Timeout after 20000ms',
  })

const LIMITS: MangaSweepLimits = {
  pageBudget: 40,
  timeBudgetMs: 180_000,
  pageAttempts: 3,
  backoffMs: 2_000,
}

/** Ranking falso: `total` nodos; `fail(offset, n)` decide si el n-ésimo intento falla. */
const harness = (opts: {
  total: number
  startOffset?: number
  limits?: Partial<MangaSweepLimits>
  fail?: (offset: number, attempt: number) => Error | undefined
  clock?: () => number
}) => {
  const fetched: number[] = []
  const saved: number[] = []
  const cursors: number[] = []
  const sleeps: number[] = []
  const attempts = new Map<number, number>()
  const run = () =>
    runMangaSweep({
      startOffset: opts.startOffset ?? 0,
      limits: { ...LIMITS, ...opts.limits },
      now: opts.clock,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      fetchPage: async (offset) => {
        fetched.push(offset)
        const attempt = (attempts.get(offset) ?? 0) + 1
        attempts.set(offset, attempt)
        const error = opts.fail?.(offset, attempt)
        if (error) throw error
        return nodes(offset, Math.max(0, Math.min(500, opts.total - offset)))
      },
      savePage: async (page) => {
        saved.push(page.length)
        return page.length - 1 // uno ya existía
      },
      saveCursor: async (offset) => {
        cursors.push(offset)
      },
    })
  return { run, fetched, saved, cursors, sleeps }
}

describe('S6 · barrido reanudable del ranking de manga', () => {
  test('guarda cada página al llegar y al llegar a una página corta resetea el cursor', async () => {
    const h = harness({ total: 1_120 })
    expect(await h.run()).toEqual({
      done: true,
      nextOffset: 0,
      pages: 3,
      inserted: 499 + 499 + 119,
    })
    expect(h.fetched).toEqual([0, 500, 1_000])
    expect(h.saved).toEqual([500, 500, 120])
    expect(h.cursors).toEqual([500, 1_000, 0])
  })

  test('reanuda desde el cursor tras una página que falla', async () => {
    const failing = harness({
      total: 1_120,
      limits: { pageAttempts: 1 },
      fail: (offset) => (offset === 1_000 ? timeout(offset) : undefined),
    })
    await expect(failing.run()).rejects.toThrow('Timeout after 20000ms')
    // Las dos páginas buenas ya están guardadas y el cursor queda en 1000.
    expect(failing.saved).toEqual([500, 500])
    expect(failing.cursors).toEqual([500, 1_000])

    const resumed = harness({ total: 1_120, startOffset: 1_000 })
    expect(await resumed.run()).toEqual({
      done: true,
      nextOffset: 0,
      pages: 1,
      inserted: 119,
    })
    expect(resumed.fetched).toEqual([1_000])
    expect(resumed.cursors).toEqual([0])
  })

  test('un timeout/5xx reintenta la página con backoff antes de fallar', async () => {
    const h = harness({
      total: 700,
      fail: (offset, attempt) =>
        offset === 500 && attempt < 3
          ? attempt === 1
            ? timeout(offset)
            : new FetchError({ kind: 'transient', url: 'x', status: 503 })
          : undefined,
    })
    expect((await h.run()).done).toBe(true)
    expect(h.fetched).toEqual([0, 500, 500, 500])
    expect(h.sleeps).toEqual([2_000, 4_000])
    expect(h.saved).toEqual([500, 200])
  })

  test('agotados los intentos de la página, la tarea falla con el cursor intacto', async () => {
    const h = harness({
      total: 5_000,
      fail: (offset) => (offset === 500 ? timeout(offset) : undefined),
    })
    await expect(h.run()).rejects.toBeInstanceOf(FetchError)
    expect(h.fetched).toEqual([0, 500, 500, 500])
    expect(h.sleeps).toEqual([2_000, 4_000])
    expect(h.cursors).toEqual([500])
  })

  test('los errores no reintentables (auth, sin client id) no se reintentan', async () => {
    const auth = harness({
      total: 5_000,
      fail: () => new FetchError({ kind: 'auth', url: 'x', status: 401 }),
    })
    await expect(auth.run()).rejects.toBeInstanceOf(FetchError)
    expect(auth.fetched).toEqual([0])
    expect(auth.sleeps).toEqual([])

    const skipped = harness({
      total: 5_000,
      fail: () => new SkippedTaskError('missing:MAL_CLIENT_ID'),
    })
    await expect(skipped.run()).rejects.toBeInstanceOf(SkippedTaskError)
    expect(skipped.fetched).toEqual([0])
  })

  test('tope de páginas por intento: corta sin terminar y deja el cursor', async () => {
    const h = harness({ total: 75_000, limits: { pageBudget: 40 } })
    expect(await h.run()).toEqual({
      done: false,
      nextOffset: 20_000,
      pages: 40,
      inserted: 40 * 499,
    })
    expect(h.fetched).toHaveLength(40)
    expect(h.fetched.at(-1)).toBe(19_500)
    expect(h.cursors.at(-1)).toBe(20_000)
  })

  test('tope de tiempo por intento: no empieza otra página pasado el presupuesto', async () => {
    let t = 0
    const h = harness({
      total: 75_000,
      limits: { timeBudgetMs: 180_000 },
      clock: () => {
        const now = t
        t += 50_000 // cada consulta del reloj avanza 50 s
        return now
      },
    })
    const result = await h.run()
    expect(result.done).toBe(false)
    expect(result.pages).toBeGreaterThan(0)
    expect(result.pages).toBeLessThan(40)
    expect(h.cursors.at(-1)).toBe(result.nextOffset)
  })

  test('cursor del payload: solo enteros ≥ 0 múltiplos de 500; si no, 0', () => {
    expect(sweepCursor(undefined)).toBe(0)
    expect(sweepCursor(1_000)).toBe(1_000)
    expect(sweepCursor(-500)).toBe(0)
    expect(sweepCursor(750)).toBe(0)
    expect(sweepCursor('1000')).toBe(0)
  })
})
