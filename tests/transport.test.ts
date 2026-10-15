import { describe, expect, test } from 'bun:test'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fetcher } from '../src/libs/fetcher.js'
import { isSocksProxy, normalizeProxy } from '../src/libs/transport.js'

describe('normalizeProxy', () => {
  test('agrega esquema a ip:port y quita la barra final', () => {
    expect(normalizeProxy('1.2.3.4:8080')).toBe('http://1.2.3.4:8080')
  })

  test('respeta el esquema declarado', () => {
    expect(normalizeProxy('socks5://1.2.3.4:1080')).toBe(
      'socks5://1.2.3.4:1080'
    )
    expect(normalizeProxy('https://1.2.3.4:8443')).toBe('https://1.2.3.4:8443')
  })

  test('conserva credenciales embebidas', () => {
    expect(normalizeProxy('user:pass@1.2.3.4:8080')).toBe(
      'http://user:pass@1.2.3.4:8080'
    )
  })

  test('inyecta PROXY_USER/PROXY_PASS cuando la entrada no las trae', () => {
    expect(normalizeProxy('1.2.3.4:8080', { user: 'u', pass: 'p' })).toBe(
      'http://u:p@1.2.3.4:8080'
    )
  })

  test('no pisa credenciales ya presentes', () => {
    expect(normalizeProxy('a:b@1.2.3.4:8080', { user: 'u', pass: 'p' })).toBe(
      'http://a:b@1.2.3.4:8080'
    )
  })

  test('rechaza entradas sin puerto o vacías', () => {
    expect(normalizeProxy('')).toBeNull()
    expect(normalizeProxy('1.2.3.4')).toBeNull()
    expect(normalizeProxy('no es una url')).toBeNull()
  })

  test('detecta los esquemas SOCKS (no soportados por Bun)', () => {
    expect(isSocksProxy('socks5://1.2.3.4:1080')).toBe(true)
    expect(isSocksProxy('socks5h://1.2.3.4:1080')).toBe(true)
    expect(isSocksProxy('socks4://1.2.3.4:1080')).toBe(true)
    expect(isSocksProxy('http://1.2.3.4:8080')).toBe(false)
  })
})

describe('transporte con proxy', () => {
  test.skipIf(!process.versions.bun)(
    'un proxy sin esquema se normaliza (no sale directo)',
    async () => {
      const received: string[] = []
      const proxy = createServer((req, res) => {
        received.push(req.url ?? '')
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"proxied":true}')
      })

      const port = await new Promise<number>((resolve) => {
        proxy.listen(0, '127.0.0.1', () =>
          resolve((proxy.address() as AddressInfo).port)
        )
      })

      try {
        const data = await fetcher<{ proxied: boolean }>({
          url: 'http://ingest-proxy-check.invalid/ok',
          agent: `127.0.0.1:${port}`, // sin esquema: el caso que rompía
          retry: { maxAttempts: 1 },
        })

        expect(data.proxied).toBe(true)
        expect(received.length).toBe(1)
      } finally {
        proxy.close()
      }
    }
  )

  test('un proxy SOCKS falla con un mensaje claro (no sale directo)', async () => {
    let message = ''
    try {
      await fetcher({
        url: 'http://ingest-proxy-check.invalid/ok',
        agent: 'socks5://127.0.0.1:1080',
        retry: { maxAttempts: 1 },
      })
    } catch (error) {
      message = String((error as Error).message)
    }
    expect(message).toContain('Unsupported proxy scheme')
    expect(message).toContain('socks5')
  })
  test.skipIf(!process.versions.bun)(
    'la request sale POR el proxy (no directa)',
    async () => {
      const received: string[] = []
      const proxy = createServer((req, res) => {
        received.push(`${req.method} ${req.url ?? ''}`)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"proxied":true}')
      })

      const port = await new Promise<number>((resolve) => {
        proxy.listen(0, '127.0.0.1', () =>
          resolve((proxy.address() as AddressInfo).port)
        )
      })

      try {
        // Host inexistente: si el proxy se ignorara, la request fallaría en DNS.
        const data = await fetcher<{ proxied: boolean }>({
          url: 'http://ingest-proxy-check.invalid/ok',
          agent: `http://127.0.0.1:${port}`,
          retry: { maxAttempts: 1 },
        })

        expect(data.proxied).toBe(true)
        expect(received[0]).toContain('http://ingest-proxy-check.invalid/ok')
      } finally {
        proxy.close()
      }
    }
  )

  test.skipIf(!process.versions.bun)(
    'un 407 del proxy se clasifica como blocked (fallo del proxy)',
    async () => {
      const proxy = createServer((_req, res) => {
        res.writeHead(407, { 'content-type': 'text/plain' })
        res.end('Error 407: Proxy Authentication Required')
      })

      const port = await new Promise<number>((resolve) => {
        proxy.listen(0, '127.0.0.1', () =>
          resolve((proxy.address() as AddressInfo).port)
        )
      })

      try {
        let kind = ''
        let proxyFault = false
        try {
          await fetcher({
            url: 'http://ingest-proxy-check.invalid/ok',
            agent: `http://127.0.0.1:${port}`,
            retry: { maxAttempts: 1 },
          })
        } catch (error) {
          kind = (error as { kind?: string }).kind ?? ''
          proxyFault = Boolean((error as { proxyFault?: boolean }).proxyFault)
        }

        expect(kind).toBe('blocked')
        expect(proxyFault).toBe(true)
      } finally {
        proxy.close()
      }
    }
  )
})
