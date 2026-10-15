import { describe, expect, test } from 'bun:test'
import { RateGate, gateKey, type RateLimits } from '../src/core/rateGate.js'

/** Reloj + sleep inyectados: tests deterministas y sin esperas reales. */
const fakeTime = () => {
  let current = 1_000_000
  const sleeps: number[] = []
  return {
    sleeps,
    now: () => current,
    sleep: async (ms: number) => {
      sleeps.push(ms)
      current += ms
    },
    advance: (ms: number) => {
      current += ms
    },
  }
}

const limits = (overrides: Partial<RateLimits> = {}): RateLimits => ({
  perSecond: 2,
  perMinute: 60,
  ...overrides,
})

describe('RateGate', () => {
  test('deja pasar hasta la cuota por segundo y espera en la siguiente', async () => {
    const time = fakeTime()
    const gate = new RateGate({ now: time.now, sleep: time.sleep })
    const key = gateKey('https://api.jikan.moe/v4/anime/1', 'http://p:1')

    expect((await gate.acquire(key, limits())).sleptMs).toBe(0)
    expect((await gate.acquire(key, limits())).sleptMs).toBe(0)
    // el tercero espera a que el más viejo salga de la ventana de 1s
    expect((await gate.acquire(key, limits())).sleptMs).toBe(1000)
  })

  test('respeta la cuota por minuto', async () => {
    const time = fakeTime()
    const gate = new RateGate({ now: time.now, sleep: time.sleep })
    const key = 'host|proxy'
    const p = limits({ perSecond: 100, perMinute: 3 })

    await gate.acquire(key, p)
    await gate.acquire(key, p)
    await gate.acquire(key, p)
    expect((await gate.acquire(key, p)).sleptMs).toBe(60_000)
  })

  test('claves distintas no se bloquean entre sí (una IP por proxy)', async () => {
    const time = fakeTime()
    const gate = new RateGate({ now: time.now, sleep: time.sleep })
    const p = limits({ perSecond: 1, perMinute: 60 })

    await gate.acquire('host|proxyA', p)
    // proxyB tiene su propio cupo: no espera
    expect((await gate.acquire('host|proxyB', p)).sleptMs).toBe(0)
    // proxyA sí espera
    expect((await gate.acquire('host|proxyA', p)).sleptMs).toBe(1000)
  })

  test('pause() frena la clave (Retry-After) y no a las demás', async () => {
    const time = fakeTime()
    const gate = new RateGate({ now: time.now, sleep: time.sleep })

    gate.pause('host|proxyA', 30_000)
    expect(gate.snapshot('host|proxyA').pausedMs).toBe(30_000)

    const waited = await gate.acquire('host|proxyA', limits())
    expect(waited.sleptMs).toBe(30_000)
    expect((await gate.acquire('host|proxyB', limits())).sleptMs).toBe(0)
  })

  test('pause() no acorta una pausa ya existente más larga', () => {
    const time = fakeTime()
    const gate = new RateGate({ now: time.now, sleep: time.sleep })

    gate.pause('k', 10_000)
    gate.pause('k', 5_000)
    expect(gate.snapshot('k').pausedMs).toBe(10_000)
  })

  test('serializa llamadores concurrentes en orden (FIFO)', async () => {
    const time = fakeTime()
    const gate = new RateGate({ now: time.now, sleep: time.sleep })
    const p = limits({ perSecond: 1, perMinute: 60 })
    const order: number[] = []

    await Promise.all(
      [1, 2, 3].map(async (n) => {
        await gate.acquire('k', p)
        order.push(n)
      })
    )

    expect(order).toEqual([1, 2, 3])
    expect(time.sleeps).toEqual([1000, 1000])
  })

  test('snapshot reporta la ventana', async () => {
    const time = fakeTime()
    const gate = new RateGate({ now: time.now, sleep: time.sleep })
    await gate.acquire('k', limits())
    await gate.acquire('k', limits())
    expect(gate.snapshot('k').inWindow).toBe(2)

    time.advance(60_001)
    expect(gate.snapshot('k').inWindow).toBe(0)
  })

  test('gateKey separa por host y por IP de salida', () => {
    const url = 'https://api.jikan.moe/v4/anime/1'
    expect(gateKey(url, 'http://a:1')).toBe('api.jikan.moe|http://a:1')
    expect(gateKey(url)).toBe('api.jikan.moe|direct')
    expect(gateKey(url, 'http://a:1')).not.toBe(gateKey(url, 'http://b:2'))
  })
})
