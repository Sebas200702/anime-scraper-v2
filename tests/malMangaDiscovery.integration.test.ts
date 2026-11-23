import { afterAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { db } from '../src/libs/db.js'
import { processMalDiscoveryMangaRanking } from '../src/processors/malDiscovery.js'
import { malDiscoveryRepository } from '../src/repositories/malDiscovery.js'
import { initializeMalMangaCharactersTasks } from '../src/scripts/initializeMalMangaCharactersTasks.js'
import { initializeMalMangaTasks } from '../src/scripts/initializeMalMangaTasks.js'
import type { ScrapingTask } from '../src/types/index.js'

/**
 * S6 contra Postgres (RUN_DB_TESTS=1): el ranking de manga inserta los ids
 * desconocidos como fila mínima, no toca los existentes, omite los sin título
 * y los derivados de manga siembran sus tareas para el nuevo.
 */
const RUN = Boolean(process.env.RUN_DB_TESTS)
const KNOWN = 997101
const UNKNOWN = 997102
const UNTITLED = 997103
const IDS = sql.join(
  [KNOWN, UNKNOWN, UNTITLED].map((id) => sql`${id}`),
  sql`, `
)

const cleanup = async () => {
  await db.execute(
    sql`DELETE FROM ingest.task
        WHERE source IN ('malManga', 'malMangaCharacters')
          AND (payload->>'mangaId')::int IN (${IDS})`
  )
  await db.execute(sql`DELETE FROM manga WHERE mal_id IN (${IDS})`)
}

const row = async (malId: number) =>
  (
    await db.execute(
      sql`SELECT title, type, status, chapters, volumes, year, synopsis
          FROM manga WHERE mal_id = ${malId}`
    )
  ).rows[0] as Record<string, unknown> | undefined

const save = (nodes: Parameters<typeof processMalDiscoveryMangaRanking>[0]) =>
  malDiscoveryRepository.saveMalDiscoveryMangaRanking([
    processMalDiscoveryMangaRanking(nodes, {
      entityId: 'mal_discovery_manga_ranking_bypopularity',
    } as ScrapingTask),
  ])

describe.skipIf(!RUN)('malDiscovery · ranking de manga (Postgres)', () => {
  afterAll(cleanup)

  test('inserta el desconocido, no toca el conocido y siembra sus derivados', async () => {
    await cleanup()
    await db.execute(
      sql`INSERT INTO manga (mal_id, title, type, status, synopsis)
          VALUES (${KNOWN}, 'Título Local', 'manhwa', 'finished', 'Sinopsis')`
    )

    const inserted = await save({
      nodes: [
        { id: KNOWN, title: 'Título MAL', media_type: 'manga', status: 'x' },
        {
          id: UNKNOWN,
          title: 'Manga Nuevo',
          media_type: 'one_shot',
          status: 'not_yet_published',
          num_chapters: 1,
          start_date: '2027-01-15',
        },
        { id: UNTITLED, media_type: 'manga' },
      ],
    })
    expect(inserted).toBe(1)

    expect(await row(KNOWN)).toEqual({
      title: 'Título Local',
      type: 'manhwa',
      status: 'finished',
      chapters: null,
      volumes: null,
      year: null,
      synopsis: 'Sinopsis',
    })
    expect(await row(UNKNOWN)).toEqual({
      title: 'Manga Nuevo',
      type: 'one_shot',
      status: 'not_yet_published',
      chapters: 1,
      volumes: null,
      year: 2027,
      synopsis: null,
    })
    expect(await row(UNTITLED)).toBeUndefined()

    // Segunda pasada: idempotente, el título insertado tampoco se pisa.
    expect(await save({ nodes: [{ id: UNKNOWN, title: 'Otro' }] })).toBe(0)
    expect((await row(UNKNOWN))?.title).toBe('Manga Nuevo')

    await initializeMalMangaTasks()
    await initializeMalMangaCharactersTasks()
    const tasks = await db.execute(
      sql`SELECT source, entity_id FROM ingest.task
          WHERE source IN ('malManga', 'malMangaCharacters')
            AND (payload->>'mangaId')::int = ${UNKNOWN}
          ORDER BY source`
    )
    expect(tasks.rows).toEqual([
      { source: 'malManga', entity_id: `manga_${UNKNOWN}` },
      { source: 'malMangaCharacters', entity_id: `manga_cast_${UNKNOWN}` },
    ])
  })
})
