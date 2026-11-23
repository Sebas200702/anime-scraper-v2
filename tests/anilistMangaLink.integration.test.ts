import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sql } from 'drizzle-orm'
import { CONFIG } from '../src/config/config.js'
import { ANILIST_MANGA_LINK_LIMITS } from '../src/config/anilistMangaLink.js'
import { getSourceConfig } from '../src/config/sources.js'
import { GenericManager } from '../src/core/genericManager.js'
import { proxyManager } from '../src/core/proxyManager.js'
import { db } from '../src/libs/db.js'
import { initializeAnilistMangaLinkTasks } from '../src/scripts/initializeAnilistMangaLinkTasks.js'
import {
  B,
  cleanup,
  linkTask,
  parkOtherAnilistTasks,
  seedFixtures,
  snapshot,
} from './anilistMangaLinkFixtures.js'

/**
 * S6 (L14) contra Postgres (RUN_DB_TESTS=1): el pase de enlace AniList de
 * manga por el GenericManager real. AniList lo sirve un servidor local.
 */
const RUN = Boolean(process.env.RUN_DB_TESTS)
const requested: number[][] = []
let fail: 'graphql' | 'http' | undefined
let server: Server
const config = CONFIG as { ANILIST_BASE: string }
const original = {
  base: CONFIG.ANILIST_BASE,
  limits: { ...ANILIST_MANGA_LINK_LIMITS },
  proxies: [] as typeof proxyManager.proxies,
}
let restore: () => Promise<void> = async () => {}

/** AniList conoce todo menos B+4; B+5 vuelve con el anilist_id de B+2 (555). */
const mediaFor = (ids: number[]) =>
  ids
    .filter((id) => id !== B + 4)
    .map((id) => ({
      id: id === B + 5 ? 555 : id - B + 70_000_000,
      idMal: id,
      countryOfOrigin: 'KR',
      bannerImage: `https://anilist/banner/${id}.jpg`,
    }))

const drain = () =>
  new GenericManager(getSourceConfig('anilist')).useIncremental({}).init()

const reschedule = () =>
  db.execute(
    sql`UPDATE ingest.task SET scheduled_at = now() WHERE source = 'anilist' AND entity_id = 'anilist_manga_link'`
  )

describe.skipIf(!RUN)('anilist · enlace AniList de manga (Postgres)', () => {
  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = ''
      req.on('data', (c) => {
        raw += c
      })
      req.on('end', () => {
        const ids = JSON.parse(raw).variables.ids as number[]
        requested.push(ids)
        if (fail === 'http' && ids.includes(B + 6)) {
          res.writeHead(503, { 'content-type': 'text/plain' })
          res.end('unavailable')
          return
        }
        const media = mediaFor(ids)
        const errors =
          fail === 'graphql' && ids.includes(B + 6)
            ? [{ message: 'Internal Server Error' }]
            : undefined
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ data: { Page: { media } }, errors }))
      })
    })
    const port = await new Promise<number>((resolve) =>
      server.listen(0, '127.0.0.1', () =>
        resolve((server.address() as AddressInfo).port)
      )
    )
    config.ANILIST_BASE = `http://127.0.0.1:${port}`
    Object.assign(ANILIST_MANGA_LINK_LIMITS, { batchSize: 2, pageBudget: 2 })
    proxyManager.init()
    original.proxies = proxyManager.proxies
    proxyManager.proxies = []
    await cleanup()
    restore = await parkOtherAnilistTasks()
    await seedFixtures()
  })

  afterAll(async () => {
    await cleanup()
    await restore()
    config.ANILIST_BASE = original.base
    Object.assign(ANILIST_MANGA_LINK_LIMITS, original.limits)
    proxyManager.proxies = original.proxies
    server.close()
  })

  test('enlaza solo-relleno, reanuda, falla sin perder cursor y completa', async () => {
    // Siembra única: dos llamadas, una fila. El test arranca tras B.
    await initializeAnilistMangaLinkTasks()
    await initializeAnilistMangaLinkTasks()
    const seeded = await db.execute(
      sql`SELECT count(*)::int AS n FROM ingest.task WHERE source = 'anilist' AND entity_id = 'anilist_manga_link'`
    )
    expect((seeded.rows[0] as { n: number }).n).toBe(1)
    await db.execute(
      sql`UPDATE ingest.task SET payload = ${JSON.stringify({ afterMalId: B })}::jsonb WHERE source = 'anilist' AND entity_id = 'anilist_manga_link'`
    )

    // 1) Tope de 2 páginas: [1,3] y [4,5]; vuelve a pending sin gastar intento.
    fail = 'graphql'
    await drain()
    expect(requested.slice(0, 2)).toEqual([
      [B + 1, B + 3],
      [B + 4, B + 5],
    ])
    let task = await linkTask()
    // 2) La misma corrida reclama otra vez: [6,7] trae error parcial → falla.
    expect(requested.slice(2)).toEqual([[B + 6, B + 7]])
    expect(task.status).toBe('pending')
    expect(task.attempts).toBe(1)
    expect(task.last_error).toContain('Internal Server Error')
    expect(task.payload).toEqual({ afterMalId: B + 5 })

    // 3) Un 503 también falla sin mover el cursor (el fetcher reintenta 3).
    fail = 'http'
    await reschedule()
    await drain()
    task = await linkTask()
    expect(task.attempts).toBe(2)
    expect(task.payload).toEqual({ afterMalId: B + 5 })
    expect((await snapshot()).linked[B + 6]).toBeNull()

    // 4) Sin fallo: [6,7] y luego nada pendiente → completa con cursor 0.
    fail = undefined
    await reschedule()
    const before = requested.length
    await drain()
    expect(requested.slice(before)).toEqual([[B + 6, B + 7]])
    task = await linkTask()
    expect(task.status).toBe('completed')
    expect(task.daily).toBe(true)
    expect(task.payload).toEqual({ afterMalId: 0 })

    const s = await snapshot()
    expect(s.linked).toEqual({
      [B + 1]: 70_000_001,
      [B + 2]: 555, // ya tenía id: intacto (ni se pidió)
      [B + 3]: 70_000_003,
      [B + 4]: null, // AniList no lo conoce: el cursor lo pasó
      [B + 5]: null, // 555 ya es de B+2: conflicto, se salta
      [B + 6]: 70_000_006, // fila externa con anilist_id NULL
      [B + 7]: 70_000_007,
    })
    expect(s.country).toEqual({
      [B + 1]: 'KR',
      [B + 2]: null,
      [B + 3]: 'JP',
      [B + 4]: null,
      [B + 5]: null,
      [B + 6]: 'KR',
      [B + 7]: 'KR',
    })
    expect(s.banners).toEqual([
      `${B + 1}:anilist:10:https://anilist/banner/${B + 1}.jpg`,
      `${B + 3}:mal:20:https://mal/banner.jpg`,
      `${B + 6}:anilist:10:https://anilist/banner/${B + 6}.jpg`,
      `${B + 7}:anilist:10:https://anilist/banner/${B + 7}.jpg`,
    ])

    // 5) Completa: no hay bucle de re-armado hasta el refresco diario.
    const after = requested.length
    await drain()
    expect(requested).toHaveLength(after)
    expect((await linkTask()).status).toBe('completed')
  })
})
