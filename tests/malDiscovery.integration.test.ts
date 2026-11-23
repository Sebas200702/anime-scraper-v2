import { afterAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { db } from '../src/libs/db.js'
import { processMalRanking } from '../src/processors/mal.js'
import { malDiscoveryRepository } from '../src/repositories/malDiscovery.js'
import { MAL_DISCOVERY_TASKS } from '../src/config/malDiscovery.js'
import { initializeMalDiscoveryTasks } from '../src/scripts/initializeMalDiscoveryTasks.js'
import type { ScrapingTask } from '../src/types/index.js'

/**
 * S1/S2 contra Postgres (RUN_DB_TESTS=1): el guardado del descubrimiento
 * inserta los ids desconocidos como fila mínima, parchea los existentes sin
 * tocar su título y omite los nodos sin título.
 */
const RUN = Boolean(process.env.RUN_DB_TESTS)
const EXISTING = 996101
const UNKNOWN = 996102
const UNTITLED = 996103

const cleanup = async () => {
  await db.execute(
    sql`DELETE FROM anime WHERE mal_id IN (${EXISTING}, ${UNKNOWN}, ${UNTITLED})`
  )
}

const row = async (malId: number) =>
  (
    await db.execute(
      sql`SELECT title, type, status, episodes, year, season, score
          FROM anime WHERE mal_id = ${malId}`
    )
  ).rows[0] as Record<string, unknown> | undefined

describe.skipIf(!RUN)('malDiscovery (Postgres)', () => {
  afterAll(cleanup)

  test('inserta desconocidos, parchea existentes y conserva su título', async () => {
    await cleanup()
    await db.execute(
      sql`INSERT INTO anime (mal_id, title) VALUES (${EXISTING}, 'Título Local')`
    )
    const processed = processMalRanking(
      {
        nodes: [
          { id: EXISTING, title: 'Título MAL', mean: 7.5 },
          {
            id: UNKNOWN,
            title: 'Nuevo de Temporada',
            media_type: 'ona',
            status: 'currently_airing',
            num_episodes: 24,
            start_season: { year: 2026, season: 'fall' },
            mean: 8.1,
          },
          { id: UNTITLED, media_type: 'tv' },
        ],
      },
      { entityId: 'mal_discovery_season_current' } as ScrapingTask
    )

    // Cada nodo cuenta una vez: el desconocido se inserta y se parchea, pero
    // suma 1 (EXISTING + UNKNOWN; UNTITLED se omite).
    const saved = await malDiscoveryRepository.saveMalDiscoverySeason([
      processed,
    ])
    expect(saved).toBe(2)

    expect(await row(EXISTING)).toMatchObject({
      title: 'Título Local',
      score: 7.5,
    })
    expect(await row(UNKNOWN)).toMatchObject({
      title: 'Nuevo de Temporada',
      type: 'ONA',
      status: 'Currently Airing',
      episodes: 24,
      year: 2026,
      season: 'fall',
      score: 8.1,
    })
    expect(await row(UNTITLED)).toBeUndefined()

    // Segunda pasada: idempotente, el título insertado tampoco se pisa.
    await malDiscoveryRepository.saveMalDiscoveryRanking([
      processMalRanking({ nodes: [{ id: UNKNOWN, title: 'Otro Título' }] }, {
        entityId: 'mal_discovery_ranking_airing',
      } as ScrapingTask),
    ])
    expect((await row(UNKNOWN))?.title).toBe('Nuevo de Temporada')
  })

  test('siembra las 4 tareas de descubrimiento una sola vez', async () => {
    await initializeMalDiscoveryTasks()
    await initializeMalDiscoveryTasks()
    const rows = await db.execute(
      sql`SELECT entity_id, task_type FROM ingest.task
          WHERE source = 'malDiscovery' ORDER BY entity_id`
    )
    expect(
      rows.rows.map((r) => (r as { entity_id: string }).entity_id)
    ).toEqual(MAL_DISCOVERY_TASKS.map((t) => t.entityId).sort())
  })
})
