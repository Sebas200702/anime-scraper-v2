import { describe, expect, test } from 'bun:test'
import { proxyManager } from '../src/core/proxyManager.js'
import type { ProxyState } from '../src/types/index.js'

const state = (
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

describe('proxyManager.allocateForWorkers', () => {
  test('devuelve los disponibles en vez de abortar cuando el pool es menor', () => {
    proxyManager.proxies = [
      state('http://a:1'),
      state('http://b:2'),
      state('http://c:3'),
    ]

    // Antes: throw 'Not enough proxies' y la corrida entera se caía.
    expect(proxyManager.allocateForWorkers(10)).toHaveLength(3)
  })

  test('ordena por LRU y excluye los muertos', () => {
    proxyManager.proxies = [
      state('http://viejo:1', { lastUsed: 500 }),
      state('http://muerto:2', { failures: 10 }),
      state('http://fresco:3', { lastUsed: 10 }),
    ]

    expect(proxyManager.allocateForWorkers(2).map((p) => p.url)).toEqual([
      'http://fresco:3',
      'http://viejo:1',
    ])
  })

  test('excluye los que están en cooldown', () => {
    proxyManager.proxies = [
      state('http://enfriando:1', { cooldownUntil: Date.now() + 60_000 }),
      state('http://libre:2'),
    ]

    expect(proxyManager.allocateForWorkers(5).map((p) => p.url)).toEqual([
      'http://libre:2',
    ])
  })

  test('sin proxies devuelve vacío (degradación, no excepción)', () => {
    proxyManager.proxies = []
    expect(proxyManager.allocateForWorkers(5)).toEqual([])
  })
})

describe('proxyManager.acquire (selección por tarea)', () => {
  test('rota por LRU usando todos los proxies, no siempre el mismo', () => {
    proxyManager.proxies = [
      state('http://a:1'),
      state('http://b:2'),
      state('http://c:3'),
    ]

    const picked = [
      proxyManager.acquire()?.url,
      proxyManager.acquire()?.url,
      proxyManager.acquire()?.url,
      proxyManager.acquire()?.url,
    ]

    // Ciclo completo antes de repetir (lastUsed se actualiza al adquirir)
    expect(picked).toEqual([
      'http://a:1',
      'http://b:2',
      'http://c:3',
      'http://a:1',
    ])
  })

  test('salta los que están en cooldown o muertos', () => {
    proxyManager.proxies = [
      state('http://muerto:1', { failures: 10 }),
      state('http://cooldown:2', { cooldownUntil: Date.now() + 30_000 }),
      state('http://vivo:3'),
    ]

    // Con un único proxy sano se reutiliza ese, nunca los excluidos.
    expect(proxyManager.acquire()?.url).toBe('http://vivo:3')
    expect(proxyManager.acquire()?.url).toBe('http://vivo:3')
  })

  test('reportSuccess limpia el cooldown y baja los fallos', () => {
    proxyManager.proxies = [
      state('http://a:1', { failures: 2, cooldownUntil: 999 }),
    ]
    proxyManager.reportSuccess('http://a:1')

    expect(proxyManager.proxies[0]?.failures).toBe(1)
    expect(proxyManager.proxies[0]?.cooldownUntil).toBe(0)
  })

  test('reportFailure aplica cooldown creciente', () => {
    proxyManager.proxies = [state('http://a:1')]
    proxyManager.reportFailure('http://a:1')

    expect(proxyManager.proxies[0]?.failures).toBe(1)
    expect(proxyManager.proxies[0]?.cooldownUntil).toBeGreaterThan(Date.now())
    expect(proxyManager.getAvailableProxies()).toHaveLength(0)
  })
})
