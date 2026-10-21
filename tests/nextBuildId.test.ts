import { describe, expect, test } from 'bun:test'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  fetchNextData,
  invalidateNextBuildId,
  resolveNextBuildId,
} from '../src/libs/nextBuildId.js'

/**
 * Sitio Next falso: el HTML anuncia un `buildId` y los datos viven en
 * `/_next/data/{buildId}/…`. Cambiar `currentBuild` simula un deploy.
 */
const startSite = async () => {
  const state = {
    currentBuild: 'build-1',
    htmlHits: 0,
    dataHits: 0,
    announce: true,
  }

  const server = createServer((req, res) => {
    const url = req.url ?? '/'

    if (url === '/') {
      state.htmlHits++
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(
        state.announce
          ? `<!doctype html><script>self.__NEXT_DATA__={"buildId":"${state.currentBuild}"}</script>`
          : '<!doctype html><p>sin buildId</p>'
      )
      return
    }

    const match = /^\/_next\/data\/([^/]+)\/(.+)$/.exec(url)
    if (match) {
      state.dataHits++
      if (match[1] !== state.currentBuild) {
        res.writeHead(404, { 'content-type': 'text/html' })
        res.end('<html>not found</html>')
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ build: match[1], path: match[2] }))
      return
    }

    res.writeHead(404, { 'content-type': 'text/html' })
    res.end('<html>nope</html>')
  })

  const port = await new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve((server.address() as AddressInfo).port)
    )
  })

  return {
    state,
    base: `http://127.0.0.1:${port}`,
    close: () => server.close(),
  }
}

describe('nextBuildId (Next.js rota el buildId en cada deploy)', () => {
  test('resuelve el buildId del HTML y lo cachea', async () => {
    invalidateNextBuildId()
    const site = await startSite()
    try {
      expect(await resolveNextBuildId(site.base)).toBe('build-1')
      expect(await resolveNextBuildId(site.base)).toBe('build-1')
      expect(site.state.htmlHits).toBe(1) // segunda vez desde cache
    } finally {
      site.close()
    }
  })

  test('trae los datos con el buildId resuelto', async () => {
    invalidateNextBuildId()
    const site = await startSite()
    try {
      const data = await fetchNextData<{ build: string; path: string }>(
        () => site.base,
        '/anime/hackliminality.json'
      )
      expect(data.build).toBe('build-1')
      expect(data.path).toBe('anime/hackliminality.json')
    } finally {
      site.close()
    }
  })

  test('si hubo deploy, el 404 se re-resuelve y reintenta (el source no muere)', async () => {
    invalidateNextBuildId()
    const site = await startSite()
    try {
      // primer fetch con build-1 (queda cacheado)
      expect(
        (await fetchNextData<{ build: string }>(() => site.base, '/a.json'))
          .build
      ).toBe('build-1')

      // deploy a mitad de corrida: el sitio anuncia build-2
      site.state.currentBuild = 'build-2'

      const data = await fetchNextData<{ build: string }>(
        () => site.base,
        '/a.json'
      )
      expect(data.build).toBe('build-2')
    } finally {
      site.close()
    }
  })

  test('el override por env gana y no toca el HTML', async () => {
    invalidateNextBuildId()
    const site = await startSite()
    try {
      expect(await resolveNextBuildId(site.base, undefined, 'forzado')).toBe(
        'forzado'
      )
      expect(site.state.htmlHits).toBe(0)
    } finally {
      site.close()
    }
  })

  test('sin buildId en el HTML falla con mensaje claro', async () => {
    invalidateNextBuildId()
    const site = await startSite()
    site.state.announce = false
    try {
      await expect(resolveNextBuildId(site.base)).rejects.toThrow(
        /No se pudo resolver el buildId/
      )
    } finally {
      site.close()
    }
  })
})
