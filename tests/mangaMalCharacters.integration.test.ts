import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { db } from '../src/libs/db.js'
import { processMalMangaCharacters } from '../src/processors/malMangaCharacters.js'
import { malMangaCharactersRepository } from '../src/repositories/malMangaCharacters.js'
import { taskRepository } from '../src/repositories/tasks.js'
import { STALENESS_VIEWS } from '../src/repositories/tasks/stalenessSql.js'
import { INITIALIZERS } from '../src/scripts/initializers.js'
import { mangaCastTaskRows } from '../src/shared/mangaCastTasks.js'
import type { ScrapingTask } from '../src/types/index.js'

/**
 * Integración del reparto de manga desde MAL (S1–S5) contra Postgres local
 * (RUN_DB_TESTS=1). Manga en el rango 9902xx; los personajes son los ids
 * reales de MAL del fixture (Haikyuu!!) y un sintético de AniList.
 */
const RUN = Boolean(process.env.RUN_DB_TESTS)

const MANGA = 990201
const HINATA = 64769
const AKAASHI = 108343
const BESSHO = 171882 // retrato = interrogante de MAL
const AKANE = 178921
const MAL_IDS = [HINATA, AKAASHI, BESSHO, AKANE]
const ANILIST_HINATA = 1_000_000_000 + 990201 // vínculo sintético de AniList
const CHARACTER_IDS = [...MAL_IDS, ANILIST_HINATA]
const ENTITY = `manga_cast_${MANGA}`

const html = readFileSync(
  new URL('./fixtures/mal-manga-characters.html', import.meta.url),
  'utf-8'
)

const inList = (values: number[]) =>
  sql.join(
    values.map((v) => sql`${v}`),
    sql`, `
  )

const rows = async <T>(query: ReturnType<typeof sql>): Promise<T[]> =>
  (await db.execute(query)).rows as T[]

const cleanup = async () => {
  await db.execute(
    sql`DELETE FROM ingest.task WHERE source = 'malMangaCharacters' AND entity_id = ${ENTITY}`
  )
  await db.execute(
    sql`DELETE FROM character WHERE mal_id IN (${inList(CHARACTER_IDS)})`
  )
  await db.execute(sql`DELETE FROM manga WHERE mal_id = ${MANGA}`)
}

const save = async () =>
  malMangaCharactersRepository.saveMalMangaCharacters([
    processMalMangaCharacters(
      { mangaId: MANGA, html },
      { payload: { mangaId: MANGA } } as unknown as ScrapingTask
    ),
  ])

const snapshot = async () => ({
  cast: await rows<{ character_id: number; role: string }>(sql`
    SELECT character_id, role FROM manga_character
    WHERE manga_id = ${MANGA} ORDER BY character_id
  `),
  characters: await rows<{ mal_id: number; name: string; name_kanji: string | null }>(sql`
    SELECT mal_id, name, name_kanji FROM character
    WHERE mal_id IN (${inList(CHARACTER_IDS)}) ORDER BY mal_id
  `),
  external: await rows<{ character_id: number; mal_id: number | null; anilist_id: number | null }>(sql`
    SELECT character_id, mal_id, anilist_id FROM character_external
    WHERE character_id IN (${inList(CHARACTER_IDS)}) ORDER BY character_id
  `),
  media: await rows<{ character_id: number; media_type: string; src: string; size: string | null; source: string; priority: number }>(sql`
    SELECT character_id, media_type, src, size, source, priority FROM character_media
    WHERE character_id IN (${inList(CHARACTER_IDS)}) ORDER BY character_id, src
  `),
})

describe.skipIf(!RUN)('reparto de manga desde MAL (Postgres local)', () => {
  beforeAll(async () => {
    await cleanup()
    await db.execute(
      sql`INSERT INTO manga (mal_id, title) VALUES (${MANGA}, 'Manga Cast Test')`
    )
    await db.execute(sql`
      INSERT INTO character (mal_id, name) VALUES (${ANILIST_HINATA}, 'Shouyou Hinata')
    `)
    await db.execute(sql`
      INSERT INTO character_external (character_id, mal_id, anilist_id, created_at, updated_at)
      VALUES (${ANILIST_HINATA}, NULL, 995201, now(), now())
    `)
    await db.execute(sql`
      INSERT INTO manga_character (manga_id, character_id, role)
      VALUES (${MANGA}, ${ANILIST_HINATA}, 'Main')
    `)
  })

  afterAll(cleanup)

  test('escribe personajes, reparto, ids externos y retratos de MAL sin tocar AniList (S3)', async () => {
    expect(await save()).toBe(4)
    const after = await snapshot()

    expect(after.cast).toEqual([
      { character_id: HINATA, role: 'Main' },
      { character_id: AKAASHI, role: 'Supporting' },
      { character_id: BESSHO, role: 'Supporting' },
      { character_id: AKANE, role: 'Supporting' },
      { character_id: ANILIST_HINATA, role: 'Main' },
    ])
    expect(after.characters).toEqual([
      { mal_id: HINATA, name: 'Hinata, Shouyou', name_kanji: null },
      { mal_id: AKAASHI, name: 'Akaashi, Keiji', name_kanji: null },
      { mal_id: BESSHO, name: 'Bessho, Kazuyoshi', name_kanji: null },
      { mal_id: AKANE, name: 'Akane', name_kanji: null },
      { mal_id: ANILIST_HINATA, name: 'Shouyou Hinata', name_kanji: null },
    ])
    expect(after.external).toEqual([
      { character_id: HINATA, mal_id: HINATA, anilist_id: null },
      { character_id: AKAASHI, mal_id: AKAASHI, anilist_id: null },
      { character_id: BESSHO, mal_id: BESSHO, anilist_id: null },
      { character_id: AKANE, mal_id: AKANE, anilist_id: null },
      { character_id: ANILIST_HINATA, mal_id: null, anilist_id: 995201 },
    ])
    const poster = (id: number, src: string) => ({
      character_id: id,
      media_type: 'poster',
      src,
      size: null,
      source: 'mal',
      priority: 20,
    })
    expect(after.media).toEqual([
      poster(HINATA, 'https://cdn.myanimelist.net/images/characters/11/243919.jpg'),
      poster(AKAASHI, 'https://cdn.myanimelist.net/images/characters/8/417876.jpg'),
      poster(AKANE, 'https://cdn.myanimelist.net/images/characters/6/402011.jpg'),
    ])
  })

  test('re-ejecutar es idempotente', async () => {
    const before = await snapshot()
    expect(await save()).toBe(4)
    expect(await snapshot()).toEqual(before)
  })

  test('siembra una sola tarea por manga y la cola la muestra (S4, S5)', async () => {
    expect(INITIALIZERS.malMangaCharacters).toBeFunction()
    for (let run = 0; run < 2; run++) {
      const existing = await taskRepository.getExistingEntityIds('malMangaCharacters')
      await taskRepository.createManyTasks(mangaCastTaskRows([MANGA], existing))
    }
    expect(
      await rows(sql`
        SELECT source, task_type, status, priority, payload FROM ingest.task
        WHERE source = 'malMangaCharacters' AND entity_id = ${ENTITY}
      `)
    ).toEqual([
      {
        source: 'malMangaCharacters',
        task_type: 'manga_mal_characters_hydration',
        status: 'pending',
        priority: 10,
        payload: { mangaId: MANGA },
      },
    ])

    const stats = await taskRepository.statsByType()
    expect(
      stats.find(
        (s) => s.taskType === 'manga_mal_characters_hydration' && s.status === 'pending'
      )?.count
    ).toBeGreaterThanOrEqual(1)

    const report = await rows<{ source: string; task_type: string; pending: number }>(
      STALENESS_VIEWS[4]!.query
    )
    expect(
      report.find((r) => r.task_type === 'manga_mal_characters_hydration')
    ).toMatchObject({ source: 'malMangaCharacters' })
  })
})
