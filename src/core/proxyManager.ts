import fs from 'node:fs/promises'
import type { ProxyState } from 'types/index.js'
import { CONFIG } from '../config/config.js'
import { normalizeProxy } from '../libs/transport.js'

const raw = await fs.readFile('./proxies.json', 'utf-8')
const rawProxies: string[] = JSON.parse(raw)

export const proxyManager = {
  proxies: [] as ProxyState[],
  initialized: false,

  init() {
    if (this.initialized) return
    this.initialized = true

    const credentials = { user: CONFIG.PROXY_USER, pass: CONFIG.PROXY_PASS }
    const normalized: string[] = []
    for (const entry of rawProxies) {
      const url = normalizeProxy(entry, credentials)
      if (url) normalized.push(url)
    }

    const skipped = rawProxies.length - normalized.length
    console.log(
      `📡 Loaded ${normalized.length} proxies${skipped > 0 ? ` (${skipped} entradas inválidas ignoradas)` : ''}`
    )
    this.proxies = normalized.map((url) => ({
      url,
      failures: 0,
      lastUsed: 0,
      cooldownUntil: 0,
      totalRequests: 0,
    }))
  },

  getAvailableProxies(): ProxyState[] {
    const now = Date.now()
    return this.proxies
      .filter((p) => p.failures < 10 && now >= p.cooldownUntil)
      .sort((a, b) => a.lastUsed - b.lastUsed) // LRU ordering
  },

  /**
   * Allocates proxy pools for N workers.
   * Distributes all available proxies evenly across workers.
   * Each worker gets multiple proxies to rotate through.
   * @returns Array of URL-string arrays, one per worker.
   */
  allocateForWorkers(workerCount: number) {
    const available = this.getAvailableProxies()
    if (available.length < workerCount) throw new Error('Not enough proxies')

    return available.slice(0, workerCount)
  },

  reportFailure(proxyUrl: string) {
    const proxy = this.proxies.find((p) => p.url === proxyUrl)
    if (!proxy) return
    proxy.failures++
    proxy.cooldownUntil =
      Date.now() + Math.min(1000 * 2 ** proxy.failures, 60_000)
  },

  reportSuccess(proxyUrl: string) {
    const proxy = this.proxies.find((p) => p.url === proxyUrl)
    if (!proxy) return
    proxy.failures = Math.max(0, proxy.failures - 1)
    proxy.cooldownUntil = 0
    proxy.totalRequests++
  },

  getHealthSummary(): {
    total: number
    healthy: number
    cooldown: number
    dead: number
  } {
    const now = Date.now()
    const total = this.proxies.length
    const dead = this.proxies.filter((p) => p.failures >= 10).length
    const cooldown = this.proxies.filter(
      (p) => p.failures < 10 && now < p.cooldownUntil
    ).length
    const healthy = total - dead - cooldown
    return { total, healthy, cooldown, dead }
  },
}
