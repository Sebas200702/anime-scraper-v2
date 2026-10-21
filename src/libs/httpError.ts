/**
 * Clasificación de fallos de red: la Fase 1 del ROADMAP distingue la causa de
 * cada respuesta para decidir reintentos, castigar (o no) al proxy y dejar
 * evidencia útil en los logs y en la cola de tareas.
 */

export type FetchErrorKind =
  | 'rate_limit'
  | 'blocked'
  | 'auth'
  | 'not_found'
  | 'transient'
  | 'invalid_body'
  | 'timeout'
  | 'network'

/**
 * Causas que apuntan al proxy/IP y no a la fuente (decisión H-07 del ROADMAP):
 * un 404, un 429 o credenciales inválidas son de la fuente y no deben castigar
 * al proxy. La Fase 3 consume `proxyFault` para puntuar y revivir proxies.
 */
const PROXY_FAULT: Record<FetchErrorKind, boolean> = {
  blocked: true,
  timeout: true,
  network: true,
  rate_limit: false,
  auth: false,
  not_found: false,
  transient: false,
  invalid_body: false,
}

const RETRYABLE: Record<FetchErrorKind, boolean> = {
  rate_limit: true,
  blocked: true,
  transient: true,
  timeout: true,
  network: true,
  auth: false,
  not_found: false,
  invalid_body: false,
}

export const classifyStatus = (status: number): FetchErrorKind => {
  if (status === 404 || status === 410) return 'not_found'
  if (status === 429) return 'rate_limit'
  // Credenciales: es de la fuente/configuración, reintentar no ayuda y el proxy
  // no tiene la culpa (un token vencido no debe quemar el pool).
  if (status === 401) return 'auth'
  // 403/451 son bloqueos (WAF, geo) que sí pueden depender de la IP; 407 es el
  // proxy pidiendo credenciales.
  if (status === 403 || status === 407 || status === 451) return 'blocked'
  if (status === 408) return 'timeout'
  if (status >= 500) return 'transient'
  // 4xx inesperado (400, 422…): el problema es la petición, reintentar no ayuda.
  return 'invalid_body'
}

const CHALLENGE_MARKERS = [
  'just a moment',
  'checking your browser',
  'attention required',
  'cf-chl',
  'captcha',
  'enable javascript and cookies',
]

/** Detecta páginas de challenge de WAF (Cloudflare y similares). */
export const isChallengeBody = (text: string): boolean => {
  const lower = text.toLowerCase()
  return CHALLENGE_MARKERS.some((marker) => lower.includes(marker))
}

/**
 * Interpreta `Retry-After` en segundos o como fecha HTTP. Devuelve milisegundos
 * y `undefined` cuando el valor no es utilizable.
 *
 * Ojo: es el valor **declarado por la fuente**, sin tope; quien espere (la
 * política de reintentos, y en Fase 2 el rate gate por host) debe acotarlo.
 */
export const parseRetryAfter = (
  value?: string | null,
  now = Date.now()
): number | undefined => {
  if (!value) return undefined

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.round(seconds * 1000)

  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, date - now)
}

interface FetchErrorInit {
  kind: FetchErrorKind
  url: string
  status?: number
  retryAfterMs?: number
  snippet?: string
  message?: string
  cause?: unknown
}

const describe = (
  kind: FetchErrorKind,
  url: string,
  status?: number,
  snippet?: string
): string => {
  const prefix =
    status !== undefined
      ? `HTTP ${status}`
      : kind === 'timeout'
        ? 'Timeout'
        : 'Network error'
  return `${prefix} (${kind}) for ${url}${snippet ? `: ${snippet}` : ''}`
}

export class FetchError extends Error {
  readonly kind: FetchErrorKind
  readonly url: string
  readonly status?: number
  readonly retryAfterMs?: number
  readonly snippet?: string

  constructor({
    kind,
    url,
    status,
    retryAfterMs,
    snippet,
    message,
    cause,
  }: FetchErrorInit) {
    super(message ?? describe(kind, url, status, snippet), { cause })
    this.name = 'FetchError'
    this.kind = kind
    this.url = url
    this.status = status
    this.retryAfterMs = retryAfterMs
    this.snippet = snippet
  }

  get retryable(): boolean {
    return RETRYABLE[this.kind]
  }

  get proxyFault(): boolean {
    return PROXY_FAULT[this.kind]
  }
}
