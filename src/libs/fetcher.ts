import { ProxyAgent, request } from 'undici'

interface FetcherOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  agent?: ProxyAgent
  options?: Record<string, any>
  body?: any
  isJson?: boolean
  /** Wall-clock budget for the whole request (headers + body). */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 30_000
const BODY_SNIPPET_LENGTH = 200

const snippet = (text: string) =>
  text.replace(/\s+/g, ' ').trim().slice(0, BODY_SNIPPET_LENGTH)

export const fetcher = async <T>({
  url,
  method = 'GET',
  headers = {},
  agent,
  body,
  isJson = true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: FetcherOptions) => {
  const defaultHeaders: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Connection: 'keep-alive',
  }
  const mergedHeaders = { ...defaultHeaders, ...headers }

  const fetchOptions = {
    method,
    headers: mergedHeaders,
    body,
    ...(agent ? { dispatcher: agent } : {}),
    // Sin timeout, un proxy colgado bloquea la tarea para siempre y la corrida
    // nunca termina. La clasificación fina (429 / blocked / timeout) llega en
    // la Fase 1.
    signal: AbortSignal.timeout(timeoutMs),
  }
  const read = async () => {
    try {
      const response = await request(url, fetchOptions)
      const text = await response.body.text()
      return { statusCode: response.statusCode, text }
    } catch (error: any) {
      // El abort de `AbortSignal.timeout` llega sin URL ni status: sin esto el
      // log de un proxy colgado es indescifrable.
      if (error?.name === 'TimeoutError' || error?.code === 'UND_ERR_ABORTED') {
        throw new Error(`Timeout after ${timeoutMs}ms for ${url}`)
      }
      throw error
    }
  }

  const { statusCode, text } = await read()

  if (statusCode >= 400) {
    throw new Error(`Api returned ${statusCode} for ${url}: ${snippet(text)}`)
  }
  if (!isJson) {
    return text as T
  }

  try {
    return JSON.parse(text) as T
  } catch {
    // Un body que no es JSON (HTML de challenge, error de CDN) se reporta con
    // evidencia en vez de reventar en una excepción de parse sin contexto.
    throw new Error(
      `Invalid JSON (${statusCode}) from ${url}: ${snippet(text)}`
    )
  }
}
