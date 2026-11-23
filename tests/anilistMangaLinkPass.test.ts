import { describe, expect, test } from 'bun:test'
import {
  type MangaLinkLimits,
  runMangaLinkPass,
} from '../src/services/anilistMangaLinkPass.js'

/**
 * S6 (L14): el pase de enlace AniList de manga avanza por `mal_id` con un
 * cursor en el payload, 50 ids por request, tope de páginas/tiempo por intento
 * y cursor a 0 al terminar. Un fallo no mueve el cursor más allá de lo escrito.
 */
const LIMITS: MangaLinkLimits = {
  batchSize: 3,
  pageBudget: 40,
  timeBudgetMs: 180_000,
}

const harness = (opts: {
  unlinked: number[]
  startAfter?: number
  limits?: Partial<MangaLinkLimits>
  failOn?: number
  clock?: () => number
}) => {
  const fetched: number[][] = []
  const saved: number[][] = []
  const cursors: number[] = []
  let throttles = 0
  const run = () =>
    runMangaLinkPass({
      startAfter: opts.startAfter ?? 0,
      limits: { ...LIMITS, ...opts.limits },
      now: opts.clock,
      throttle: async () => {
        throttles++
      },
      selectIds: async (after, limit) =>
        opts.unlinked.filter((id) => id > after).slice(0, limit),
      fetchPage: async (ids) => {
        fetched.push(ids)
        if (opts.failOn !== undefined && ids.includes(opts.failOn))
          throw new Error('AniList: partial error')
        // AniList solo conoce los ids pares.
        return ids
          .filter((id) => id % 2 === 0)
          .map((id) => ({ id: id + 1000, idMal: id }))
      },
      savePage: async (ids, media) => {
        saved.push(ids)
        return media.length
      },
      saveCursor: async (after) => {
        cursors.push(after)
      },
    })
  return { run, fetched, saved, cursors, throttles: () => throttles }
}

describe('runMangaLinkPass', () => {
  test('recorre en lotes, salta los desconocidos y al terminar vuelve a 0', async () => {
    const h = harness({ unlinked: [1, 2, 3, 5, 8, 9, 10] })
    expect(await h.run()).toEqual({
      done: true,
      cursor: 0,
      pages: 3,
      linked: 3,
    })
    expect(h.fetched).toEqual([[1, 2, 3], [5, 8, 9], [10]])
    // El cursor avanza al último id pedido (conocido o no) y termina en 0.
    expect(h.cursors).toEqual([3, 9, 0])
    // La primera página ya pagó su cupo en el dispatcher.
    expect(h.throttles()).toBe(2)
  })

  test('reanuda desde el cursor del payload', async () => {
    const h = harness({ unlinked: [1, 2, 3, 5, 8, 9, 10], startAfter: 3 })
    const result = await h.run()
    expect(h.fetched).toEqual([[5, 8, 9], [10]])
    expect(result).toEqual({ done: true, cursor: 0, pages: 2, linked: 2 })
  })

  test('tope de páginas: devuelve continuación con el cursor guardado', async () => {
    const h = harness({
      unlinked: [1, 2, 3, 4, 5, 6, 7],
      limits: { pageBudget: 2 },
    })
    expect(await h.run()).toEqual({
      done: false,
      cursor: 6,
      pages: 2,
      linked: 3,
    })
    expect(h.cursors).toEqual([3, 6])
  })

  test('tope de tiempo: corta tras la página que lo agota', async () => {
    // Cada lectura del reloj avanza 60 ms: inicio 60, tras la 1.ª 120 (<100
    // transcurridos), tras la 2.ª 180 (120 ≥ 100) → corta con 2 páginas.
    let t = 0
    const h = harness({
      unlinked: [1, 2, 3, 4, 5, 6, 7],
      limits: { timeBudgetMs: 100 },
      clock: () => {
        t += 60
        return t
      },
    })
    const result = await h.run()
    expect(result.done).toBe(false)
    expect(result.pages).toBe(2)
    expect(h.cursors).toEqual([3, 6])
  })

  test('sin pendientes completa enseguida y deja el cursor en 0', async () => {
    const h = harness({ unlinked: [], startAfter: 9 })
    expect(await h.run()).toEqual({
      done: true,
      cursor: 0,
      pages: 0,
      linked: 0,
    })
    expect(h.fetched).toEqual([])
    expect(h.cursors).toEqual([0])
  })

  test('un fallo sube el error y el cursor queda en lo último escrito', async () => {
    const h = harness({ unlinked: [1, 2, 3, 4, 5, 6, 7], failOn: 5 })
    await expect(h.run()).rejects.toThrow('partial error')
    expect(h.saved).toEqual([[1, 2, 3]])
    expect(h.cursors).toEqual([3])
  })
})
