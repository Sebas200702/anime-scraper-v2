import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { CONFIG } from '../src/config/config.js'
import {
  fetchMalDiscoveryRanking,
  fetchMalDiscoverySeason,
} from '../src/services/malDiscovery.js'
import { malSeasonAt } from '../src/shared/malSeason.js'
import type { ScrapingTask } from '../src/types/index.js'

/**
 * Las tareas de anime de malDiscovery piden exactamente las mismas URLs que
 * antes del barrido reanudable de manga (L9). Las URLs esperadas son literales
 * (las que emitía b1caf2f), contra un servidor local: nunca se contacta MAL.
 */
const FIELDS =
  'id%2Ctitle%2Cmain_picture%2Calternative_titles%2Cstart_date%2Cend_date%2Csynopsis%2Cmean%2Crank%2Cpopularity%2Cnum_list_users%2Cnum_scoring_users%2Cgenres%2Cmedia_type%2Cstatus%2Cnum_episodes%2Cstart_season%2Cbroadcast%2Csource%2Caverage_episode_duration%2Crating%2Cstudios'

const requests: { url: string; clientId: string | undefined }[] = []
let server: Server
const original = {
  base: CONFIG.MAL_API_BASE,
  clientId: CONFIG.MAL_CLIENT_ID,
}
const config = CONFIG as { MAL_API_BASE: string; MAL_CLIENT_ID?: string }

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://local')
    requests.push({
      url: req.url ?? '',
      clientId: req.headers['x-mal-client-id'] as string | undefined,
    })
    // Página llena en offset 0 de una temporada; corta en el resto.
    const full =
      url.pathname.startsWith('/v2/anime/season/') &&
      url.searchParams.get('offset') === '0'
    const count = full ? 500 : 2
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        data: Array.from({ length: count }, (_, i) => ({
          node: { id: i + 1, title: `A${i + 1}` },
        })),
      })
    )
  })
  const port = await new Promise<number>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve((server.address() as AddressInfo).port)
    )
  )
  config.MAL_API_BASE = `http://127.0.0.1:${port}/v2`
  config.MAL_CLIENT_ID = 'test-client'
})

afterAll(() => {
  config.MAL_API_BASE = original.base
  config.MAL_CLIENT_ID = original.clientId
  server.close()
})

const task = (payload: Record<string, unknown>) =>
  ({ id: 1, payload }) as unknown as ScrapingTask

describe('malDiscovery · requests de anime sin cambios', () => {
  test('temporada actual/siguiente y rankings upcoming/airing: mismas URLs', async () => {
    const now = new Date()
    const current = malSeasonAt(now, 0)
    const next = malSeasonAt(now, 1)
    requests.length = 0

    const seasonCurrent = await fetchMalDiscoverySeason(
      task({ seasonOffset: 0 })
    )
    const seasonNext = await fetchMalDiscoverySeason(task({ seasonOffset: 1 }))
    const upcoming = await fetchMalDiscoveryRanking(
      task({ rankingType: 'upcoming' })
    )
    const airing = await fetchMalDiscoveryRanking(
      task({ rankingType: 'airing' })
    )

    expect(requests).toEqual(
      [
        `/v2/anime/season/${current.year}/${current.season}?limit=500&offset=0&fields=${FIELDS}&nsfw=true`,
        `/v2/anime/season/${current.year}/${current.season}?limit=500&offset=500&fields=${FIELDS}&nsfw=true`,
        `/v2/anime/season/${next.year}/${next.season}?limit=500&offset=0&fields=${FIELDS}&nsfw=true`,
        `/v2/anime/season/${next.year}/${next.season}?limit=500&offset=500&fields=${FIELDS}&nsfw=true`,
        `/v2/anime/ranking?ranking_type=upcoming&limit=500&offset=0&fields=${FIELDS}&nsfw=true`,
        `/v2/anime/ranking?ranking_type=airing&limit=500&offset=0&fields=${FIELDS}&nsfw=true`,
      ].map((url) => ({ url, clientId: 'test-client' }))
    )
    // Mismo resultado de siempre: todos los nodos en un solo `nodes`.
    expect(seasonCurrent.nodes).toHaveLength(502)
    expect(seasonNext.nodes).toHaveLength(502)
    expect(upcoming.nodes).toHaveLength(2)
    expect(airing.nodes).toHaveLength(2)
  })
})
