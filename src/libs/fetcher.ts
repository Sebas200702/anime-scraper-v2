import {
  FetchError,
  classifyStatus,
  isChallengeBody,
  parseRetryAfter,
} from './httpError.js'
import { type ProxyTarget, send } from './transport.js'

export { FetchError } from './httpError.js'
export type { FetchErrorKind } from './httpError.js'

export interface RetryPolicy {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  /** Tope para el `Retry-After` que declare la fuente (evita dormir horas). */
  maxRetryAfterMs: number
  /** Fracción de jitter simétrico aplicada al backoff (0 = determinista). */
  jitter: number
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  maxRetryAfterMs: 60_000,
  jitter: 0.5,
}

const DEFAULT_TIMEOUT_MS = 30_000
const SNIPPET_LENGTH = 200

const HTML_CONTENT_TYPE = /text\/html|application\/xhtml/i
const JSON_CONTENT_TYPE = /application\/(?:[\w.+-]*\+)?json|text\/json/i

export interface FetcherOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  /**
   * URL del proxy (recomendado: enruta bajo Bun y Node) o un `ProxyAgent`
   * (solo Node; bajo Bun se avisa y se ignora, H-17).
   */
  agent?: ProxyTarget
  body?: any
  isJson?: boolean
  /** Presupuesto total (headers + body) de cada intento. */
  timeoutMs?: number
  headersTimeoutMs?: number
  bodyTimeoutMs?: number
  /** Presupuesto global del llamador: al agotarse se corta request y reintento. */
  signal?: AbortSignal
  retry?: Partial<RetryPolicy>
}

const defaultHeaders: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Connection: 'keep-alive',
}

const snippetOf = (
  text: string,
  contentType?: string,
  fallback = '(empty body)'
): string => {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized) return normalized.slice(0, SNIPPET_LENGTH)
  return contentType ? `content-type=${contentType}` : fallback
}

const looksLikeJson = (text: string): boolean => {
  const first = text.trimStart()[0]
  return first === '{' || first === '['
}

/**
 * El body manda, pero el `content-type` puede vetarlo: una página HTML con
 * payload JSON-like es un bloqueo o un error, nunca un dato.
 */
const shouldParseAsJson = (text: string, contentType?: string): boolean => {
  if (contentType && HTML_CONTENT_TYPE.test(contentType)) return false
  if (looksLikeJson(text)) return true
  // Declarado JSON: cubre escalares válidos (`123`, `null`, `"ok"`).
  return Boolean(contentType && JSON_CONTENT_TYPE.test(contentType))
}

const normalizeRetry = (policy: RetryPolicy): RetryPolicy => {
  const positive = (
    value: number,
    name: string,
    min: number,
    fallback?: number
  ): number => {
    if (Number.isInteger(value) && value >= min) return value
    if (fallback !== undefined) return fallback
    // Falla ruidoso: una política inválida no debe convertirse en un falso
    // "network error" sin haber tocado la red.
    throw new Error(`Invalid retry policy: ${name}=${String(value)}`)
  }

  return {
    maxAttempts: positive(policy.maxAttempts, 'maxAttempts', 1),
    baseDelayMs: positive(policy.baseDelayMs, 'baseDelayMs', 0),
    maxDelayMs: positive(policy.maxDelayMs, 'maxDelayMs', 0),
    maxRetryAfterMs: positive(policy.maxRetryAfterMs, 'maxRetryAfterMs', 0),
    jitter: Number.isFinite(policy.jitter)
      ? Math.min(1, Math.max(0, policy.jitter))
      : DEFAULT_RETRY.jitter,
  }
}

/**
 * Delay del próximo intento: `Retry-After` de la fuente (con tope propio) o
 * backoff exponencial con jitter simétrico.
 */
export const nextDelay = (
  attempt: number,
  retryAfterMs: number | undefined,
  policy: RetryPolicy
): number => {
  if (retryAfterMs !== undefined) {
    return Math.min(retryAfterMs, policy.maxRetryAfterMs)
  }

  const exponential = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * 2 ** (attempt - 1)
  )
  if (policy.jitter <= 0) return Math.round(exponential)
  return Math.round(
    exponential * (1 - policy.jitter / 2 + Math.random() * policy.jitter)
  )
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const TIMEOUT_CODES = [
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
]

const toFetchError = (
  error: unknown,
  url: string,
  timeoutMs: number,
  budget?: AbortSignal
): FetchError => {
  if (error instanceof FetchError) return error

  const candidate = error as { name?: string; code?: string; message?: string }

  if (budget?.aborted) {
    return new FetchError({
      kind: 'timeout',
      url,
      message: `Budget exhausted for ${url}`,
      cause: error,
    })
  }

  const isTimeout =
    candidate?.name === 'TimeoutError' ||
    TIMEOUT_CODES.includes(candidate?.code ?? '')

  if (isTimeout) {
    return new FetchError({
      kind: 'timeout',
      url,
      message: `Timeout after ${timeoutMs}ms for ${url}`,
      cause: error,
    })
  }

  // El mensaje del transporte suele ser lo único que identifica al proxy caído.
  return new FetchError({
    kind: 'network',
    url,
    snippet: snippetOf(
      candidate?.message ?? String(error),
      undefined,
      '(no transport message)'
    ),
    cause: error,
  })
}

const requestOnce = async <T>(options: FetcherOptions): Promise<T> => {
  const {
    url,
    method = 'GET',
    headers = {},
    agent,
    body,
    isJson = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headersTimeoutMs = timeoutMs,
    bodyTimeoutMs = timeoutMs,
  } = options

  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs)

  let statusCode: number
  let contentType: string | undefined
  let retryAfter: string | null
  let text: string

  try {
    const response = await send({
      url,
      method,
      headers: { ...defaultHeaders, ...headers },
      body,
      proxy: agent,
      headersTimeoutMs,
      bodyTimeoutMs,
      signal,
    })
    statusCode = response.status
    contentType = response.headers.get('content-type') ?? undefined
    retryAfter = response.headers.get('retry-after')
    text = response.text
  } catch (error) {
    throw toFetchError(error, url, timeoutMs, options.signal)
  }

  if (statusCode >= 400) {
    throw new FetchError({
      kind: classifyStatus(statusCode),
      url,
      status: statusCode,
      retryAfterMs: parseRetryAfter(retryAfter),
      snippet: snippetOf(text, contentType),
    })
  }

  if (!isJson) return text as T

  if (!shouldParseAsJson(text, contentType)) {
    const snippet = snippetOf(text, contentType)
    // Un HTML con marcador de WAF es un bloqueo del proxy, no un body raro.
    const kind = isChallengeBody(text) ? 'blocked' : 'invalid_body'
    throw new FetchError({ kind, url, status: statusCode, snippet })
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new FetchError({
      kind: 'invalid_body',
      url,
      status: statusCode,
      snippet: snippetOf(text, contentType),
    })
  }
}

/**
 * Request HTTP con clasificación de fallos y reintentos.
 *
 * - `rate_limit` / `blocked` / `transient` / `timeout` / `network` se reintentan
 *   (respetando `Retry-After`); `auth`, `not_found` e `invalid_body` no.
 * - El error lanzado es siempre un `FetchError` con `kind`, `retryable` y
 *   `proxyFault`.
 * - `signal` permite acotar el presupuesto total de una tarea (el llamador
 *   decide; PR2 lo cablea desde el rate gate).
 */
export const fetcher = async <T>(options: FetcherOptions): Promise<T> => {
  const policy = normalizeRetry({ ...DEFAULT_RETRY, ...options.retry })
  let lastError: FetchError | null = null

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    if (options.signal?.aborted) {
      throw (
        lastError ??
        new FetchError({
          kind: 'timeout',
          url: options.url,
          message: `Budget exhausted before attempt ${attempt} for ${options.url}`,
        })
      )
    }

    try {
      return await requestOnce<T>(options)
    } catch (error) {
      const fetchError = toFetchError(
        error,
        options.url,
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        options.signal
      )
      lastError = fetchError

      if (!fetchError.retryable || attempt === policy.maxAttempts) {
        throw fetchError
      }

      const delayMs = nextDelay(attempt, fetchError.retryAfterMs, policy)
      console.warn(
        `↻ ${fetchError.kind} en ${options.url} (intento ${attempt}/${policy.maxAttempts}) — espera ${delayMs}ms`
      )
      await sleep(delayMs)
    }
  }

  // Inalcanzable con maxAttempts >= 1 (el loop siempre retorna o lanza); el
  // throw existe para que TypeScript tenga un camino de salida.
  throw lastError ?? new FetchError({ kind: 'network', url: options.url })
}
