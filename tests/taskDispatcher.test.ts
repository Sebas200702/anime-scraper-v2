import { describe, expect, test } from 'bun:test'
import type { ProxyState } from '../src/types/index.js'
import { RateGate } from '../src/core/rateGate.js'
import {
  type DispatcherTask,
  TaskDispatcher,
} from '../src/core/taskDispatcher.js'
import { FetchError } from '../src/libs/httpError.js'
import { SkippedTaskError } from '../src/libs/skippedTaskError.js'

const proxy = (
  url: string,
  overrides: Partial<ProxyState> = {}
): ProxyState => ({
  url,
  failures: 0,
  lastUsed: 0,
  cooldownUntil: 0,
  totalRequests: 0,
  ...overrides,
})

const fakeTime = () => {
  let current = 1_000_000
  return {
    now: () => current,
    sleep: async (ms: number) => {
      current += ms
    },
  }
}

const task = (id: number): DispatcherTask => ({
  id,
  taskType: 'anime_details_hydration',
})

const noLimits = {
  host: 'api.jikan.moe',
  limits: { perSecond: 0, perMinute: 1e9 },
}

describe('TaskDispatcher', () => {
  test('respeta maxInFlight', async () => {
    let inFlight = 0
    let peak = 0
    const dispatcher = new TaskDispatcher({
      maxInFlight: 3,
      gate: new RateGate(fakeTime()),
      acquireProxy: () => undefined,
      limitsFor: () => noLimits,
    })

    await dispatcher.drain(
      Array.from({ length: 12 }, (_, i) => task(i)),
      {
        run: async () => {
          inFlight++
          peak = Math.max(peak, inFlight)
          await new Promise((r) => setTimeout(r, 1))
          inFlight--
          return 1
        },
        onDone: () => {},
        onError: () => {},
      }
    )

    expect(peak).toBe(3)
  })

  test('reparte las tareas entre todas las IPs (una por tarea)', async () => {
    const pool = [proxy('http://a:1'), proxy('http://b:2'), proxy('http://c:3')]
    const used: (string | undefined)[] = []

    const dispatcher = new TaskDispatcher({
      maxInFlight: 1,
      gate: new RateGate(fakeTime()),
      // rotación estilo LRU
      acquireProxy: () => {
        const next = pool.shift()
        if (next) pool.push(next)
        return next
      },
      limitsFor: () => noLimits,
    })

    const summary = await dispatcher.drain(
      Array.from({ length: 7 }, (_, i) => task(i)),
      {
        run: async (_task, proxyUrl) => {
          used.push(proxyUrl)
          return proxyUrl
        },
        onDone: () => {},
        onError: () => {},
      }
    )

    expect(used).toEqual([
      'http://a:1',
      'http://b:2',
      'http://c:3',
      'http://a:1',
      'http://b:2',
      'http://c:3',
      'http://a:1',
    ])
    expect(summary.proxiesUsed).toBe(3)
    expect(summary.processed).toBe(7)
  })

  test('un 429 pausa esa (host, IP) y no toca al proxy', async () => {
    const time = fakeTime()
    const gate = new RateGate(time)
    const reported: { proxyUrl?: string; error?: FetchError }[] = []

    const dispatcher = new TaskDispatcher({
      maxInFlight: 1,
      gate,
      acquireProxy: () => proxy('http://a:1'),
      limitsFor: () => noLimits,
      reportProxy: (proxyUrl, error) => reported.push({ proxyUrl, error }),
    })

    const summary = await dispatcher.drain([task(1)], {
      run: async () => {
        throw new FetchError({
          kind: 'rate_limit',
          url: 'https://api.jikan.moe/v4/anime/1',
          status: 429,
          retryAfterMs: 30_000,
        })
      },
      onDone: () => {},
      onError: () => {},
    })

    expect(summary.byKind.rate_limit).toBe(1)
    expect(summary.failed).toBe(1)
    expect(gate.snapshot('api.jikan.moe|http://a:1').pausedMs).toBe(30_000)
    // 429 es de la fuente: el proxy no se penaliza
    expect(reported).toHaveLength(0)
  })

  test('un fallo atribuible al proxy sí lo penaliza', async () => {
    const reported: { proxyUrl?: string; error?: FetchError }[] = []

    const dispatcher = new TaskDispatcher({
      maxInFlight: 1,
      gate: new RateGate(fakeTime()),
      acquireProxy: () => proxy('http://a:1'),
      limitsFor: () => noLimits,
      reportProxy: (proxyUrl, error) => reported.push({ proxyUrl, error }),
    })

    await dispatcher.drain([task(1)], {
      run: async () => {
        throw new FetchError({
          kind: 'blocked',
          url: 'https://x/1',
          status: 403,
        })
      },
      onDone: () => {},
      onError: () => {},
    })

    expect(reported).toHaveLength(1)
    expect(reported[0]?.proxyUrl).toBe('http://a:1')
    expect(reported[0]?.error?.kind).toBe('blocked')
  })

  test('un 404 no penaliza al proxy', async () => {
    const reported: unknown[] = []

    const dispatcher = new TaskDispatcher({
      maxInFlight: 1,
      gate: new RateGate(fakeTime()),
      acquireProxy: () => proxy('http://a:1'),
      limitsFor: () => noLimits,
      reportProxy: (...args) => reported.push(args),
    })

    await dispatcher.drain([task(1)], {
      run: async () => {
        throw new FetchError({
          kind: 'not_found',
          url: 'https://x/1',
          status: 404,
        })
      },
      onDone: () => {},
      onError: () => {},
    })

    expect(reported).toHaveLength(0)
  })

  test('un fallo no aborta la corrida y el exitoso sí reporta el proxy', async () => {
    const reported: (string | undefined)[] = []
    const failed: number[] = []
    const done: number[] = []

    const dispatcher = new TaskDispatcher({
      maxInFlight: 2,
      gate: new RateGate(fakeTime()),
      acquireProxy: () => proxy('http://a:1'),
      limitsFor: () => noLimits,
      reportProxy: (proxyUrl, error) => {
        if (!error) reported.push(proxyUrl)
      },
    })

    const summary = await dispatcher.drain([task(1), task(2), task(3)], {
      run: async (t) => {
        if (t.id === 2) throw new Error('boom')
        return t.id
      },
      onDone: (t) => {
        done.push(t.id)
      },
      onError: (t) => {
        failed.push(t.id)
      },
    })

    expect(done.sort()).toEqual([1, 3])
    expect(failed).toEqual([2])
    expect(reported).toHaveLength(2)
    expect(summary.processed).toBe(2)
    expect(summary.failed).toBe(1)
    expect(summary.byKind.unknown).toBe(1)
  })

  test('una dependencia pendiente se cuenta como skipped y no penaliza al proxy', async () => {
    const reported: unknown[] = []

    const dispatcher = new TaskDispatcher({
      maxInFlight: 1,
      gate: new RateGate(fakeTime()),
      acquireProxy: () => proxy('http://a:1'),
      limitsFor: () => noLimits,
      reportProxy: (...args) => reported.push(args),
    })

    const errors: string[] = []
    const summary = await dispatcher.drain([task(1)], {
      run: async () => {
        throw new SkippedTaskError('missing:kitsu_id')
      },
      onDone: () => {},
      onError: (_t, error) => {
        errors.push((error as SkippedTaskError).reason)
      },
    })

    expect(summary.byKind.skipped).toBe(1)
    expect(errors).toEqual(['missing:kitsu_id'])
    expect(reported).toHaveLength(0) // no es culpa del proxy
  })

  test('el éxito limpia el proxy (sin error en reportProxy)', async () => {
    const outcomes: (FetchError | undefined)[] = []

    const dispatcher = new TaskDispatcher({
      maxInFlight: 1,
      gate: new RateGate(fakeTime()),
      acquireProxy: () => proxy('http://a:1'),
      limitsFor: () => noLimits,
      reportProxy: (_proxyUrl, error) => outcomes.push(error),
    })

    await dispatcher.drain([task(1)], {
      run: async () => 'ok',
      onDone: () => {},
      onError: () => {},
    })

    expect(outcomes).toEqual([undefined])
  })
})
