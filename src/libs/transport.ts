import { ProxyAgent, request } from 'undici'
import { isBunRuntime, warnIfProxyIgnored } from './runtime.js'

/**
 * Un proxy puede venir como URL (enruta bajo Bun y bajo Node) o como
 * `ProxyAgent` (solo enruta bajo Node: el shim de Bun lo ignora, ver H-17).
 */
export type ProxyTarget = string | ProxyAgent

export interface HeaderReader {
  get(name: string): string | null
}

export interface TransportRequest {
  url: string
  method: string
  headers: Record<string, string>
  body?: unknown
  proxy?: ProxyTarget
  headersTimeoutMs: number
  bodyTimeoutMs: number
  signal: AbortSignal
}

export interface TransportResponse {
  status: number
  headers: HeaderReader
  text: string
}

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
const SOCKS_SCHEME = /^socks(4|4a|5|5h)?:\/\//i

/**
 * Bun solo enruta proxies HTTP/HTTPS en `fetch(url, { proxy })`: un
 * `socks5://` se ignoraría en silencio (mismo tipo de fallo que H-17), así que
 * se rechaza explícitamente.
 */
export const isSocksProxy = (target: string): boolean =>
  SOCKS_SCHEME.test(target)

const assertSupportedProxy = (proxy: ProxyTarget | undefined): void => {
  if (typeof proxy !== 'string' || !isSocksProxy(proxy)) return
  throw new Error(
    `Unsupported proxy scheme for ${proxy}: usa el endpoint HTTP/HTTPS del proveedor, o corre con Node (undici Socks5ProxyAgent), o puentea con gost/microsocks`
  )
}

/**
 * Normaliza y valida un proxy antes de usarlo. Un `ip:port` sin esquema haría
 * que el runtime fallara en el instante (o saliera directo), así que se
 * normaliza aquí: la misma clase de fallo silencioso que H-17/H-20.
 */
const resolveProxy = (target?: ProxyTarget): ProxyTarget | undefined => {
  if (typeof target !== 'string' || !target) return target

  const normalized = normalizeProxy(target)
  if (!normalized) {
    throw new Error(`Invalid proxy: ${target}`)
  }
  assertSupportedProxy(normalized)
  return normalized
}

/**
 * Normaliza una entrada de listado a URL de proxy.
 *
 * Acepta `ip:port`, `user:pass@ip:port` y URLs con esquema (`http://`,
 * `https://`, `socks5://`). Inyecta `PROXY_USER`/`PROXY_PASS` cuando la entrada
 * no trae credenciales (los listados públicos suelen responder 407, H-18).
 * Devuelve `null` si la entrada no es utilizable.
 */
export const normalizeProxy = (
  entry: string,
  credentials?: { user?: string; pass?: string }
): string | null => {
  const trimmed = entry.trim()
  if (!trimmed) return null

  try {
    const url = new URL(SCHEME.test(trimmed) ? trimmed : `http://${trimmed}`)
    if (!url.hostname || !url.port) return null

    if (!url.username && credentials?.user && credentials.pass) {
      url.username = credentials.user
      url.password = credentials.pass
    }

    // Sin barra final: los runtimes no la esperan en la URL del proxy.
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

const proxyAgents = new Map<string, ProxyAgent>()

const agentFor = (proxyUrl: string): ProxyAgent => {
  const cached = proxyAgents.get(proxyUrl)
  if (cached) return cached

  const agent = new ProxyAgent(proxyUrl)
  proxyAgents.set(proxyUrl, agent)
  return agent
}

const headerReader = (
  record: Record<string, string | string[] | undefined>
): HeaderReader => ({
  get: (name) => {
    const value = record[name] ?? record[name.toLowerCase()]
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
  },
})

const sendWithFetch = async ({
  url,
  method,
  headers,
  body,
  proxy,
  signal,
}: TransportRequest): Promise<TransportResponse> => {
  // Un ProxyAgent bajo Bun es un stub: avisar en vez de fingir que proxya.
  if (proxy && typeof proxy !== 'string') warnIfProxyIgnored(proxy)

  const init: Record<string, unknown> = { method, headers, signal }
  if (typeof proxy === 'string') init.proxy = proxy
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }

  const response = await fetch(url, init as RequestInit)
  return {
    status: response.status,
    headers: response.headers,
    text: await response.text(),
  }
}

const sendWithUndici = async ({
  url,
  method,
  headers,
  body,
  proxy,
  headersTimeoutMs,
  bodyTimeoutMs,
  signal,
}: TransportRequest): Promise<TransportResponse> => {
  const dispatcher = typeof proxy === 'string' ? agentFor(proxy) : proxy

  const response = await request(url, {
    method: method as 'GET',
    headers,
    body: body as never,
    ...(dispatcher ? { dispatcher } : {}),
    headersTimeout: headersTimeoutMs,
    bodyTimeout: bodyTimeoutMs,
    signal,
  })

  return {
    status: response.statusCode,
    headers: headerReader(response.headers),
    text: await response.body.text(),
  }
}

/**
 * Envía la request por el transporte del runtime:
 * - Bun: `fetch` nativo, que soporta `proxy` por request (CONNECT incluido).
 * - Node: `undici` real, con un `ProxyAgent` cacheado por URL de proxy.
 */
export const send = (req: TransportRequest): Promise<TransportResponse> => {
  const resolved: TransportRequest = { ...req, proxy: resolveProxy(req.proxy) }
  return isBunRuntime() ? sendWithFetch(resolved) : sendWithUndici(resolved)
}
