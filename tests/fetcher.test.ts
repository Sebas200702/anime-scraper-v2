import { describe, expect, test } from 'bun:test'
import {
  type IncomingMessage,
  type ServerResponse,
  createServer,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { ProxyAgent } from 'undici'
import {
  FetchError,
  fetcher,
  nextDelay,
  type RetryPolicy,
} from '../src/libs/fetcher.js'
import {
  classifyStatus,
  isChallengeBody,
  parseRetryAfter,
} from '../src/libs/httpError.js'

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  count: number
) => void

const json = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

const html = (res: ServerResponse, status: number, body: string) => {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
  res.end(body)
}

const withServer = async (
  handler: Handler,
  run: (base: string, counts: Map<string, number>) => Promise<void>
) => {
  const counts = new Map<string, number>()
  const server = createServer((req, res) => {
    res.on('error', () => {}) // el cliente puede abortar
    const key = req.url ?? '/'
    const count = (counts.get(key) ?? 0) + 1
    counts.set(key, count)
    handler(req, res, count)
  })
  const port = await new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve((server.address() as AddressInfo).port)
    )
  })
  try {
    await run(`http://127.0.0.1:${port}`, counts)
  } finally {
    server.close()
  }
}

const capture = async (run: () => Promise<unknown>): Promise<FetchError> => {
  try {
    await run()
  } catch (error) {
    if (error instanceof FetchError) return error
    throw error
  }
  throw new Error('se esperaba un FetchError')
}

const fastRetry: Partial<RetryPolicy> = {
  maxAttempts: 3,
  baseDelayMs: 1,
  maxDelayMs: 2,
  jitter: 0,
}

describe('fetcher — respuestas válidas', () => {
  test('200 JSON devuelve el dato parseado', async () => {
    await withServer(
      (_req, res) => json(res, 200, { value: 42 }),
      async (base, counts) => {
        const data = await fetcher<{ value: number }>({
          url: `${base}/ok`,
          retry: fastRetry,
        })
        expect(data.value).toBe(42)
        expect(counts.get('/ok')).toBe(1)
      }
    )
  })

  test('JSON escalar declarado como application/json se acepta', async () => {
    await withServer(
      (_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('123')
      },
      async (base) => {
        expect(
          await fetcher<number>({ url: `${base}/n`, retry: fastRetry })
        ).toBe(123)
      }
    )
  })

  test('JSON con content-type text/plain se parsea igual', async () => {
    await withServer(
      (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('{"ok":1}')
      },
      async (base) => {
        const data = await fetcher<{ ok: number }>({
          url: `${base}/plain`,
          retry: fastRetry,
        })
        expect(data.ok).toBe(1)
      }
    )
  })

  test('isJson: false devuelve el texto crudo', async () => {
    await withServer(
      (_req, res) => html(res, 200, '<div>raw</div>'),
      async (base) => {
        const body = await fetcher<string>({
          url: `${base}/page`,
          isJson: false,
          retry: fastRetry,
        })
        expect(body).toBe('<div>raw</div>')
      }
    )
  })
})

describe('fetcher — clasificación de fallos', () => {
  test('404 → not_found, sin reintento', async () => {
    await withServer(
      (_req, res) => json(res, 404, { error: 'nope' }),
      async (base, counts) => {
        const error = await capture(() =>
          fetcher({ url: `${base}/missing`, retry: fastRetry })
        )
        expect(error.kind).toBe('not_found')
        expect(error.status).toBe(404)
        expect(error.retryable).toBe(false)
        expect(error.proxyFault).toBe(false)
        expect(counts.get('/missing')).toBe(1)
      }
    )
  })

  test('410 → not_found', async () => {
    await withServer(
      (_req, res) => json(res, 410, {}),
      async (base) => {
        const error = await capture(() =>
          fetcher({ url: `${base}/gone`, retry: fastRetry })
        )
        expect(error.kind).toBe('not_found')
      }
    )
  })

  test('401 → auth: no reintenta y no culpa al proxy', async () => {
    await withServer(
      (_req, res) => json(res, 401, { error: 'invalid api key' }),
      async (base, counts) => {
        const error = await capture(() =>
          fetcher({ url: `${base}/auth`, retry: fastRetry })
        )
        expect(error.kind).toBe('auth')
        expect(error.retryable).toBe(false)
        expect(error.proxyFault).toBe(false)
        expect(counts.get('/auth')).toBe(1)
      }
    )
  })

  test('403 → blocked y penaliza al proxy', async () => {
    await withServer(
      (_req, res) => json(res, 403, { error: 'forbidden' }),
      async (base, counts) => {
        const error = await capture(() =>
          fetcher({ url: `${base}/blocked`, retry: fastRetry })
        )
        expect(error.kind).toBe('blocked')
        expect(error.retryable).toBe(true)
        expect(error.proxyFault).toBe(true)
        expect(counts.get('/blocked')).toBe(3)
      }
    )
  })

  test('429 → rate_limit con Retry-After, sin culpar al proxy', async () => {
    await withServer(
      (_req, res) =>
        json(res, 429, { message: 'slow down' }, { 'retry-after': '30' }),
      async (base) => {
        const error = await capture(() =>
          fetcher({
            url: `${base}/limited`,
            retry: { ...fastRetry, maxAttempts: 1 },
          })
        )
        expect(error.kind).toBe('rate_limit')
        expect(error.status).toBe(429)
        expect(error.retryAfterMs).toBe(30_000)
        expect(error.proxyFault).toBe(false)
      }
    )
  })

  test('408 → timeout reintentable', async () => {
    await withServer(
      (_req, res) => json(res, 408, {}),
      async (base) => {
        const error = await capture(() =>
          fetcher({ url: `${base}/slow-gateway`, retry: fastRetry })
        )
        expect(error.kind).toBe('timeout')
        expect(error.retryable).toBe(true)
      }
    )
  })

  test('400 inesperado → invalid_body sin reintento', async () => {
    await withServer(
      (_req, res) => json(res, 400, { error: 'bad request' }),
      async (base, counts) => {
        const error = await capture(() =>
          fetcher({ url: `${base}/bad`, retry: fastRetry })
        )
        expect(error.kind).toBe('invalid_body')
        expect(counts.get('/bad')).toBe(1)
      }
    )
  })

  test('500 → transient y reintenta hasta agotar intentos', async () => {
    await withServer(
      (_req, res) => json(res, 500, { error: 'boom' }),
      async (base, counts) => {
        const error = await capture(() =>
          fetcher({ url: `${base}/boom`, retry: fastRetry })
        )
        expect(error.kind).toBe('transient')
        expect(error.retryable).toBe(true)
        expect(counts.get('/boom')).toBe(3)
      }
    )
  })

  test('fallo transitorio seguido de éxito devuelve el dato', async () => {
    await withServer(
      (_req, res, count) =>
        count < 3 ? json(res, 503, {}) : json(res, 200, { ok: true }),
      async (base, counts) => {
        const data = await fetcher<{ ok: boolean }>({
          url: `${base}/flaky`,
          retry: fastRetry,
        })
        expect(data.ok).toBe(true)
        expect(counts.get('/flaky')).toBe(3)
      }
    )
  })

  test('puerto cerrado → network, reintentable y culpa al proxy', async () => {
    const error = await capture(() =>
      fetcher({
        url: 'http://127.0.0.1:1/dead',
        retry: { ...fastRetry, baseDelayMs: 1 },
      })
    )
    expect(error.kind).toBe('network')
    expect(error.retryable).toBe(true)
    expect(error.proxyFault).toBe(true)
    expect(error.snippet).toBeTruthy()
  })
})

describe('fetcher — sniff de body (content-type + primer caracter)', () => {
  test('HTML con payload JSON-like NO se acepta como dato', async () => {
    await withServer(
      (_req, res) => html(res, 200, '{"error":"page not found"}'),
      async (base, counts) => {
        const error = await capture(() =>
          fetcher({ url: `${base}/html-json`, retry: fastRetry })
        )
        expect(error.kind).toBe('invalid_body')
        expect(error.snippet).toContain('{"error"')
        expect(counts.get('/html-json')).toBe(1)
      }
    )
  })

  test('HTML de challenge (200) → blocked, no invalid_body', async () => {
    await withServer(
      (_req, res) =>
        html(res, 200, '<html><title>Just a moment...</title></html>'),
      async (base, counts) => {
        const error = await capture(() =>
          fetcher({ url: `${base}/challenge`, retry: fastRetry })
        )
        expect(error.kind).toBe('blocked')
        expect(error.proxyFault).toBe(true)
        expect(counts.get('/challenge')).toBe(3)
      }
    )
  })

  test('HTML sin marcador → invalid_body, sin reintento', async () => {
    await withServer(
      (_req, res) => html(res, 200, '<html><body>Not found here</body></html>'),
      async (base, counts) => {
        const error = await capture(() =>
          fetcher({ url: `${base}/garbage`, retry: fastRetry })
        )
        expect(error.kind).toBe('invalid_body')
        expect(error.retryable).toBe(false)
        expect(error.snippet).toContain('<html>')
        expect(counts.get('/garbage')).toBe(1)
      }
    )
  })

  test('JSON truncado (200) → invalid_body con evidencia', async () => {
    await withServer(
      (_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"data": [1, 2')
      },
      async (base, counts) => {
        const error = await capture(() =>
          fetcher({ url: `${base}/truncated`, retry: fastRetry })
        )
        expect(error.kind).toBe('invalid_body')
        expect(error.snippet).toContain('{"data"')
        expect(counts.get('/truncated')).toBe(1)
      }
    )
  })

  test('body vacío (200) → invalid_body con el content-type en la evidencia', async () => {
    await withServer(
      (_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('')
      },
      async (base) => {
        const error = await capture(() =>
          fetcher({ url: `${base}/empty`, retry: fastRetry })
        )
        expect(error.kind).toBe('invalid_body')
        expect(error.snippet).toContain('content-type=application/json')
      }
    )
  })
})

describe('fetcher — timeouts y presupuesto', () => {
  test('respuesta lenta → timeout con url y ms, reintentable', async () => {
    await withServer(
      (_req, res) => {
        setTimeout(() => {
          try {
            if (!res.writableEnded) json(res, 200, { ok: true })
          } catch {
            // el cliente abortó (timeout): el socket puede estar cerrado
          }
        }, 500)
      },
      async (base, counts) => {
        const error = await capture(() =>
          fetcher({
            url: `${base}/slow`,
            timeoutMs: 100,
            retry: { ...fastRetry, maxAttempts: 1 },
          })
        )
        expect(error.kind).toBe('timeout')
        expect(error.retryable).toBe(true)
        expect(error.proxyFault).toBe(true)
        expect(error.message).toContain('100ms')
        expect(error.message).toContain(`${base}/slow`)
        expect(counts.get('/slow')).toBe(1)
      }
    )
  })

  test('presupuesto agotado (signal) corta sin nuevos intentos', async () => {
    await withServer(
      (_req, res) => {
        setTimeout(() => {
          try {
            if (!res.writableEnded) json(res, 200, { ok: true })
          } catch {
            // abortado por presupuesto
          }
        }, 500)
      },
      async (base, counts) => {
        const controller = new AbortController()
        setTimeout(() => controller.abort(), 50)

        const error = await capture(() =>
          fetcher({
            url: `${base}/budget`,
            signal: controller.signal,
            retry: fastRetry,
          })
        )
        expect(error.kind).toBe('timeout')
        expect(error.message).toContain('Budget exhausted')
        expect(counts.get('/budget')).toBe(1)
      }
    )
  })

  test.skipIf(!process.versions.bun)(
    'avisa cuando el runtime ignora el ProxyAgent (Bun)',
    async () => {
      const logged: unknown[] = []
      const original = console.error
      console.error = (...args: unknown[]) => {
        logged.push(args[0])
      }

      try {
        await withServer(
          (_req, res) => json(res, 200, { ok: true }),
          async (base) => {
            const data = await fetcher<{ ok: boolean }>({
              url: `${base}/warn`,
              agent: new ProxyAgent('http://127.0.0.1:1'),
              retry: fastRetry,
            })
            // El stub no rompe la request, por eso el aviso es indispensable.
            expect(data.ok).toBe(true)
          }
        )
      } finally {
        console.error = original
      }

      expect(logged.some((entry) => String(entry).includes('ProxyAgent'))).toBe(
        true
      )
    }
  )
})

describe('fetcher — política de reintentos', () => {
  test('Retry-After se respeta y gana al backoff exponencial', async () => {
    await withServer(
      (_req, res, count) =>
        count === 1
          ? json(res, 429, {}, { 'retry-after': '1' })
          : json(res, 200, { ok: true }),
      async (base, counts) => {
        const started = Date.now()
        const data = await fetcher<{ ok: boolean }>({
          url: `${base}/limited`,
          // baseDelay 300ms contra un Retry-After acotado a 50ms
          retry: { ...fastRetry, baseDelayMs: 300, maxRetryAfterMs: 50 },
        })
        expect(data.ok).toBe(true)
        expect(counts.get('/limited')).toBe(2)
        expect(Date.now() - started).toBeLessThan(250)
      }
    )
  })

  test('una política inválida falla ruidosamente (no fabrica un network)', () => {
    expect(() =>
      fetcher({ url: 'http://127.0.0.1:1/x', retry: { maxAttempts: 0 } })
    ).toThrow(/Invalid retry policy/)
    expect(() =>
      fetcher({
        url: 'http://127.0.0.1:1/x',
        retry: { maxAttempts: Number.NaN },
      })
    ).toThrow(/Invalid retry policy/)
  })

  const policy = (overrides: Partial<RetryPolicy> = {}): RetryPolicy => ({
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 10_000,
    maxRetryAfterMs: 60_000,
    jitter: 0,
    ...overrides,
  })

  test('backoff exponencial con tope', () => {
    const p = policy({ maxDelayMs: 250 })
    expect(nextDelay(1, undefined, p)).toBe(100)
    expect(nextDelay(2, undefined, p)).toBe(200)
    expect(nextDelay(3, undefined, p)).toBe(250)
  })

  test('Retry-After tiene prioridad y su propio tope', () => {
    const p = policy({ maxRetryAfterMs: 5_000 })
    expect(nextDelay(1, 2_000, p)).toBe(2_000)
    expect(nextDelay(1, 90_000, p)).toBe(5_000)
    expect(nextDelay(1, 0, p)).toBe(0)
  })

  test('jitter simétrico acotado a [1-j/2, 1+j/2] del exponencial', () => {
    const p = policy({ jitter: 0.5 })
    for (let i = 0; i < 50; i++) {
      const delay = nextDelay(1, undefined, p)
      expect(delay).toBeGreaterThanOrEqual(75)
      expect(delay).toBeLessThanOrEqual(125)
    }
  })
})

describe('httpError — helpers de clasificación', () => {
  test('classifyStatus cubre los códigos relevantes', () => {
    expect(classifyStatus(404)).toBe('not_found')
    expect(classifyStatus(410)).toBe('not_found')
    expect(classifyStatus(401)).toBe('auth')
    expect(classifyStatus(403)).toBe('blocked')
    expect(classifyStatus(407)).toBe('blocked')
    expect(classifyStatus(451)).toBe('blocked')
    expect(classifyStatus(429)).toBe('rate_limit')
    expect(classifyStatus(408)).toBe('timeout')
    expect(classifyStatus(500)).toBe('transient')
    expect(classifyStatus(503)).toBe('transient')
    expect(classifyStatus(400)).toBe('invalid_body')
    expect(classifyStatus(422)).toBe('invalid_body')
  })

  test('parseRetryAfter: segundos, fecha HTTP y basura', () => {
    const now = Date.parse('2026-10-15T12:00:00Z')
    expect(parseRetryAfter('30', now)).toBe(30_000)
    expect(parseRetryAfter('0', now)).toBe(0)
    expect(parseRetryAfter(new Date(now + 45_000).toUTCString(), now)).toBe(
      45_000
    )
    expect(parseRetryAfter('nonsense', now)).toBeUndefined()
    expect(parseRetryAfter(undefined, now)).toBeUndefined()
  })

  test('parseRetryAfter: fecha pasada no es negativa', () => {
    const now = Date.parse('2026-10-15T12:00:00Z')
    expect(parseRetryAfter(new Date(now - 10_000).toUTCString(), now)).toBe(0)
  })

  test('isChallengeBody detecta marcadores de WAF', () => {
    expect(isChallengeBody('<title>Just a moment...</title>')).toBe(true)
    expect(isChallengeBody('Checking your browser before accessing')).toBe(true)
    expect(isChallengeBody('Attention Required! | Cloudflare')).toBe(true)
    expect(isChallengeBody('{"data": []}')).toBe(false)
    expect(isChallengeBody('<html><body>Not found here</body></html>')).toBe(
      false
    )
  })
})
