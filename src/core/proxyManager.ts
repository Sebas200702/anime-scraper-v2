import fs from 'node:fs/promises'
import type { Proxy } from 'types/index.js'
const raw = await fs.readFile('./proxies.json', 'utf-8')
const proxies = JSON.parse(raw)


export const proxyManager = {
  proxies: [] as Proxy[],

  init() {
    console.log(`Loaded ${proxies.length} proxies`)
    this.proxies = proxies.map((proxy: string) => ({
      value: `http://${proxy}`,
      isUsed: false,
      failures: 0,
    }))
  },

  getProxy() {
    const available = this.proxies.filter((p) => !p.isUsed)

    if (available.length === 0) {
      throw new Error('No available proxies')
    }

    const proxy = available[Math.floor(Math.random() * available.length)]
    if (proxy) {
      proxy.isUsed = true
    }

    return proxy
  },

  releaseProxy(proxy: { isUsed: boolean }) {
    proxy.isUsed = false
  },

  markFailure(proxy: { failures: number; isUsed: boolean }) {
    proxy.failures++

    if (proxy.failures >= 3) {
      proxy.isUsed = true // bloqueado permanentemente
    } else {
      proxy.isUsed = false
    }
  },

  getProxyList(length: number) {
    if (length > this.proxies.filter((p) => !p.isUsed).length) {
      throw new Error('Not enough available proxies')
    }

    const list = []

    for (let i = 0; i < length; i++) {
      list.push(this.getProxy())
    }

    return list
  },
}
