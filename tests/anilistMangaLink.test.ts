import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { CONFIG } from '../src/config/config.js'
import {
  ANILIST_MANGA_LINK_TASK,
  ANILIST_MANGA_LINK_TASKS,
} from '../src/config/anilistMangaLink.js'
import { REFRESH_POLICY, getSourceConfig } from '../src/config/sources.js'
import { toMangaLinks } from '../src/processors/anilistMangaLink.js'
import * as anilistProcessors from '../src/processors/anilist.js'
import * as anilistServices from '../src/services/anilist.js'
import { fetchAnilistMangaLinkPage } from '../src/services/anilistMangaLink.js'
import type { ScrapingTask } from '../src/types/index.js'

/** S6 (L14): mapeo, request y declaración del pase de enlace AniList de manga. */
const bodies: { query: string; variables: unknown }[] = []
let reply: unknown = {}
let server: Server
const config = CONFIG as { ANILIST_BASE: string }
const originalBase = CONFIG.ANILIST_BASE

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
    })
    req.on('end', () => {
      bodies.push(JSON.parse(raw))
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(reply))
    })
  })
  const port = await new Promise<number>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve((server.address() as AddressInfo).port)
    )
  )
  config.ANILIST_BASE = `http://127.0.0.1:${port}`
})

afterAll(() => {
  config.ANILIST_BASE = originalBase
  server.close()
})

describe('toMangaLinks', () => {
  test('solo ids pedidos, sin duplicar mal_id ni anilist_id', () => {
    const links = toMangaLinks(
      [1, 2, 3],
      [
        { id: 10, idMal: 1, countryOfOrigin: 'KR', bannerImage: 'b1' },
        { id: 11, idMal: 1, countryOfOrigin: 'JP' },
        { id: 10, idMal: 2 },
        { id: 12, idMal: 99 },
        { id: 13, idMal: null },
        { id: 14, idMal: 3, countryOfOrigin: null, bannerImage: null },
      ]
    )
    expect(links).toEqual([
      { malId: 1, anilistId: 10, country: 'KR', banner: 'b1' },
      { malId: 3, anilistId: 14, country: null, banner: null },
    ])
  })
})

describe('fetchAnilistMangaLinkPage', () => {
  test('pide 1 página de idMal_in con type MANGA', async () => {
    reply = { data: { Page: { media: [{ id: 5, idMal: 1 }] } } }
    expect(await fetchAnilistMangaLinkPage([1, 2])).toEqual([
      { id: 5, idMal: 1 },
    ])
    const body = bodies.at(-1)!
    expect(body.variables).toEqual({ ids: [1, 2] })
    expect(body.query).toContain('perPage: 50')
    expect(body.query).toContain('media(idMal_in: $ids, type: MANGA)')
    expect(body.query).toContain('countryOfOrigin')
    expect(body.query).toContain('bannerImage')
  })

  test('un error GraphQL parcial falla la página (no escribe a medias)', async () => {
    reply = {
      data: { Page: { media: [{ id: 5, idMal: 1 }] } },
      errors: [{ message: 'Internal Server Error' }],
    }
    await expect(fetchAnilistMangaLinkPage([1])).rejects.toThrow(
      'AniList: Internal Server Error'
    )
  })
})

describe('declaración y política', () => {
  test('tarea única bajo la fuente anilist (mismo gate graphql.anilist.co)', () => {
    expect(getSourceConfig('anilist').tasks[ANILIST_MANGA_LINK_TASK]).toEqual({
      entity: 'anilistMangaLink',
      needsPayload: true,
    })
    expect(ANILIST_MANGA_LINK_TASKS).toEqual([
      {
        source: 'anilist',
        entityId: 'anilist_manga_link',
        taskType: 'manga_anilist_link_hydration',
        priority: 25,
        status: 'pending',
        payload: { afterMalId: 0 },
      },
    ])
    expect(REFRESH_POLICY[ANILIST_MANGA_LINK_TASK]).toEqual({
      cold: 20 * 3600,
      hot: 20 * 3600,
    })
  })

  test('PRESERVE: banner y catálogo de anilist siguen igual', async () => {
    const tasks = getSourceConfig('anilist').tasks
    expect(tasks.anime_banner_hydration).toEqual({
      entity: 'animeBanners',
      needsPayload: true,
    })
    expect(tasks.anilist_year_hydration).toEqual({
      entity: 'anilistCatalog',
      needsPayload: true,
    })
    expect(REFRESH_POLICY.anime_banner_hydration).toEqual({
      cold: null,
      hot: 90 * 86400,
    })
    expect(REFRESH_POLICY.anilist_year_hydration).toEqual({
      cold: 30 * 86400,
      hot: 30 * 86400,
    })
    expect(typeof anilistProcessors.processAnimeBanners).toBe('function')
    expect(typeof anilistProcessors.processAnilistCatalog).toBe('function')

    reply = { data: { Media: { id: 1, idMal: 7 } } }
    const raw = await anilistServices.fetchAnimeBanners({
      payload: { animeId: 7 },
    } as unknown as ScrapingTask)
    expect(raw).toEqual(reply as typeof raw)
    const body = bodies.at(-1)!
    expect(body.variables).toEqual({ idMal: 7 })
    expect(body.query).toStartWith(
      'query ($idMal: Int) {\n  Media(idMal: $idMal, type: ANIME) {\n    id\n    idMal\n    bannerImage'
    )

    reply = { data: { Page: { pageInfo: { hasNextPage: false }, media: [] } } }
    await anilistServices.fetchAnilistCatalog({
      payload: { year: 2001 },
    } as unknown as ScrapingTask)
    expect(bodies.at(-1)!.variables).toEqual({ year: 2001, page: 1 })
  })
})
