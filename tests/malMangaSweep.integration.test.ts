import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sql } from 'drizzle-orm'
import { CONFIG } from '../src/config/config.js'
import {
  MAL_DISCOVERY_MANGA_RANKING_TASK,
  MAL_DISCOVERY_SOURCE,
  MAL_DISCOVERY_TASKS,
  MANGA_SWEEP_LIMITS,
} from '../src/config/malDiscovery.js'
import { getSourceConfig } from '../src/config/sources.js'
import { GenericManager } from '../src/core/genericManager.js'
import { proxyManager } from '../src/core/proxyManager.js'
import { db } from '../src/libs/db.js'
import { taskRepository } from '../src/repositories/tasks.js'

/**
 * S6 (L9) contra Postgres (RUN_DB_TESTS=1): el barrido de manga, por el
 * GenericManager real, guarda cada página, deja el cursor en el payload,
 * vuelve a `pending` mientras no termina, reanuda tras un fallo y al terminar
 * se completa con el refresco semanal y el cursor en 0. El ranking lo sirve un
 * servidor local: nunca se contacta MAL.
 */
const RUN = Boolean(process.env.RUN_DB_TESTS)
const BASE_ID = 996_000_000
const TOTAL = 2_503 // páginas llenas 0…2000, corta en 2500
const ENTITY = 'mal_discovery_manga_ranking_bypopularity'

const requested: number[] = []
let failOffset: number | undefined
let server: Server
const config = CONFIG as { MAL_API_BASE: string; MAL_CLIENT_ID?: string }
const original = {
  base: CONFIG.MAL_API_BASE,
  clientId: CONFIG.MAL_CLIENT_ID,
  limits: { ...MANGA_SWEEP_LIMITS },
  proxies: [] as typeof proxyManager.proxies,
}
let parked: { id: number; status: string; refresh_after: unknown }[] = []

const cleanup = async () => {
  await db.execute(
    sql`DELETE FROM ingest.task WHERE source = ${MAL_DISCOVERY_SOURCE} AND entity_id = ${ENTITY}`
  )
  await db.execute(
    sql`DELETE FROM manga WHERE mal_id > ${BASE_ID} AND mal_id <= ${BASE_ID + TOTAL}`
  )
}

const mangaTask = async () =>
  (
    await db.execute(
      sql`SELECT status, attempts, payload, last_error,
                 refresh_after > now() + interval '163 hours'
                   AND refresh_after < now() + interval '165 hours' AS weekly
          FROM ingest.task
          WHERE source = ${MAL_DISCOVERY_SOURCE} AND entity_id = ${ENTITY}`
    )
  ).rows[0] as {
    status: string
    attempts: number
    payload: Record<string, unknown>
    last_error: string | null
    weekly: boolean | null
  }

const inserted = async () =>
  Number(
    (
      (
        await db.execute(
          sql`SELECT count(*)::int AS n FROM manga
              WHERE mal_id > ${BASE_ID} AND mal_id <= ${BASE_ID + TOTAL}`
        )
      ).rows[0] as { n: number }
    ).n
  )

const drain = (maxTasks?: number) =>
  new GenericManager(getSourceConfig(MAL_DISCOVERY_SOURCE))
    .useIncremental({ maxTasks })
    .init()

describe.skipIf(!RUN)(
  'malDiscovery · barrido reanudable de manga (Postgres)',
  () => {
    beforeAll(async () => {
      server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://local')
        const offset = Number(url.searchParams.get('offset'))
        requested.push(offset)
        if (offset === failOffset) {
          res.writeHead(503, { 'content-type': 'text/plain' })
          res.end('unavailable')
          return
        }
        const count = Math.max(0, Math.min(500, TOTAL - offset))
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            data: Array.from({ length: count }, (_, i) => ({
              node: {
                id: BASE_ID + offset + i + 1,
                title: `Sweep ${offset + i + 1}`,
                media_type: 'manga',
              },
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
      Object.assign(MANGA_SWEEP_LIMITS, {
        pageBudget: 2,
        pageAttempts: 2,
        backoffMs: 1,
      })
      // Directo al servidor local: sin proxies en este test.
      proxyManager.init()
      original.proxies = proxyManager.proxies
      proxyManager.proxies = []

      await cleanup()
      // Las tareas de anime de malDiscovery quedan fuera de estas corridas.
      parked = (
        await db.execute(
          sql`SELECT id, status, refresh_after FROM ingest.task
            WHERE source = ${MAL_DISCOVERY_SOURCE} AND entity_id <> ${ENTITY}`
        )
      ).rows as typeof parked
      await db.execute(
        sql`UPDATE ingest.task SET status = 'completed', refresh_after = now() + interval '1 day'
          WHERE source = ${MAL_DISCOVERY_SOURCE} AND entity_id <> ${ENTITY}`
      )
      await taskRepository.createManyTasks(
        MAL_DISCOVERY_TASKS.filter((t) => t.entityId === ENTITY)
      )
    })

    afterAll(async () => {
      await cleanup()
      for (const row of parked)
        await db.execute(
          sql`UPDATE ingest.task SET status = ${row.status}, refresh_after = ${row.refresh_after}
            WHERE id = ${row.id}`
        )
      config.MAL_API_BASE = original.base
      config.MAL_CLIENT_ID = original.clientId
      Object.assign(MANGA_SWEEP_LIMITS, original.limits)
      proxyManager.proxies = original.proxies
      server.close()
    })

    test('guarda por página, re-arma, reanuda tras un fallo y completa semanal', async () => {
      // 1) Tope de 2 páginas y una sola tarea en la corrida: vuelve a pending.
      await drain(1)
      expect(requested).toEqual([0, 500])
      expect(await inserted()).toBe(1_000)
      let task = await mangaTask()
      expect(task.status).toBe('pending')
      expect(task.attempts).toBe(0)
      expect(task.payload).toEqual({
        rankingType: 'bypopularity',
        offset: 1_000,
      })

      // 2) La página 1000 falla (503 en sus 2 intentos): la tarea falla, pero
      //    lo guardado se queda y el cursor sigue en 1000.
      failOffset = 1_000
      await drain()
      expect(requested).toEqual([0, 500, 1_000, 1_000])
      task = await mangaTask()
      expect(task.status).toBe('pending')
      expect(task.attempts).toBe(1)
      expect(task.last_error).toContain('503')
      expect(task.payload).toEqual({
        rankingType: 'bypopularity',
        offset: 1_000,
      })
      expect(await inserted()).toBe(1_000)

      // 3) Sin fallo: reanuda en 1000, re-arma tras 2 páginas y en la misma
      //    corrida termina con la página corta (2500).
      failOffset = undefined
      await db.execute(
        sql`UPDATE ingest.task SET scheduled_at = now()
          WHERE source = ${MAL_DISCOVERY_SOURCE} AND entity_id = ${ENTITY}`
      )
      await drain()
      expect(requested).toEqual([
        0, 500, 1_000, 1_000, 1_000, 1_500, 2_000, 2_500,
      ])
      expect(await inserted()).toBe(TOTAL)
      task = await mangaTask()
      expect(task.status).toBe('completed')
      expect(task.weekly).toBe(true)
      expect(task.payload).toEqual({ rankingType: 'bypopularity', offset: 0 })

      // 4) Completo: no hay bucle de re-armado hasta el próximo refresco semanal.
      await drain()
      expect(requested).toHaveLength(8)
      expect((await mangaTask()).status).toBe('completed')
      expect(MAL_DISCOVERY_MANGA_RANKING_TASK).toBe(
        'manga_mal_discovery_ranking_hydration'
      )
    })
  }
)
