/**
 * El runtime importa: Bun resuelve `undici` a su propia implementación, donde
 * `ProxyAgent` es un stub que ignora la URL del proxy:
 *
 *   class ProxyAgent extends DispatcherBase { constructor() { super(); } }
 *
 * Consecuencia: bajo Bun las requests salen por la IP local y el pool de
 * proxies no se usa (hallazgo H-17 del ROADMAP). Mientras PR2 decide el
 * transporte (Node con undici real, o el proxy nativo de Bun vía
 * `fetch(url, { proxy })`), esto avisa fuerte para que no pase silencioso.
 */

export const isBunRuntime = (): boolean =>
  typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'

let warned = false

export const warnIfProxyIgnored = (agent: unknown): void => {
  if (!agent || warned || !isBunRuntime()) return
  warned = true
  console.error(
    '⚠️  Bun ignora ProxyAgent (stub del runtime): las requests salen por la IP local, no por el proxy. Ver ROADMAP H-17.'
  )
}
