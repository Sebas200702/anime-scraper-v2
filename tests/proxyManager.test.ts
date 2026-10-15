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
