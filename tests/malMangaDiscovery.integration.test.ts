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
 * desconocidos con la ficha del ranking, refresca los existentes (T10), omite los sin título
 * y los derivados de manga siembran sus tareas para el nuevo.
 */
const RUN = Boolean(process.env.RUN_DB_TESTS)
const KNOWN = 997101
const UNKNOWN = 997102
const UNTITLED = 997103
const RICH = 997104
const KEPT = 997105
const IDS = sql.join(
  [KNOWN, UNKNOWN, UNTITLED, RICH, KEPT].map((id) => sql`${id}`),
  sql`, `
)

const cleanup = async () => {
  await db.execute(
    sql`DELETE FROM ingest.task
        WHERE source IN ('malManga', 'malMangaCharacters')
          AND (payload->>'mangaId')::int IN (${IDS})`
  )
  await db.execute(sql`DELETE FROM manga_relation WHERE manga_id IN (${IDS})`)
  for (const table of ['manga_genre', 'manga_media', 'manga_title_synonym'])
    await db.execute(
      sql`DELETE FROM ${sql.raw(table)} WHERE manga_id IN (${IDS})`
    )
  await db.execute(
    sql`DELETE FROM manga_external_ids WHERE manga_id IN (${IDS})`
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

  test('inserta el desconocido, refresca el conocido y siembra sus derivados', async () => {
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

    // T10 (L16): el conocido conserva título y tipo; solo su estado sigue al
    // valor no nulo de MAL (antes de T10 quedaba 'finished').
    expect(await row(KNOWN)).toEqual({
      title: 'Título Local',
      type: 'manhwa',
      status: 'x',
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

  test('L12: el nuevo entra con la ficha del ranking; el conocido solo se refresca (T10)', async () => {
    await cleanup()
    await db.execute(
      sql`INSERT INTO manga (mal_id, title, type, status, synopsis)
          VALUES (${KNOWN}, 'Título Local', 'manhwa', 'finished', 'Sinopsis')`
    )
    const rich = (id: number) => ({
      id,
      title: 'Ficha Completa',
      main_picture: {
        medium: `https://cdn.test/${id}m.jpg`,
        large: `https://cdn.test/${id}l.jpg`,
      },
      alternative_titles: { en: 'Full Sheet', ja: 'フル', synonyms: ['FS'] },
      start_date: '2020-02-03',
      end_date: '2021-04-05',
      synopsis: 'Una sinopsis del ranking.',
      media_type: 'manga',
      status: 'finished',
      genres: [{ id: 1, name: 'Action' }],
      num_chapters: 40,
      num_volumes: 5,
      popularity: 1234,
      num_list_users: 5678,
      mean: 7.5,
      num_scoring_users: 910,
    })

    expect(await save({ nodes: [rich(KNOWN), rich(RICH)] })).toBe(1)

    const full = (
      await db.execute(
        sql`SELECT title, title_english, title_japanese, synopsis, score,
                   scored_by, popularity_rank, members, chapters, volumes, year,
                   published_from::date::text AS published_from,
                   published_to::date::text AS published_to
            FROM manga WHERE mal_id = ${RICH}`
      )
    ).rows[0]
    expect(full).toEqual({
      title: 'Ficha Completa',
      title_english: 'Full Sheet',
      title_japanese: 'フル',
      synopsis: 'Una sinopsis del ranking.',
      score: 7.5,
      scored_by: 910,
      popularity_rank: 1234,
      members: 5678,
      chapters: 40,
      volumes: 5,
      year: 2020,
      published_from: '2020-02-03',
      published_to: '2021-04-05',
    })
    const count = async (table: string, id: number) =>
      Number(
        (
          await db.execute(
            sql`SELECT count(*) AS n FROM ${sql.raw(table)} WHERE manga_id = ${id}`
          )
        ).rows[0]?.n
      )
    expect(await count('manga_media', RICH)).toBe(2)
    expect(await count('manga_genre', RICH)).toBe(1)
    expect(await count('manga_title_synonym', RICH)).toBe(3)

    // T10 (L16) cambia lo que antes era "no recibe nada": título, tipo y
    // sinopsis existentes se conservan; capítulos/volúmenes (stats no nulas de
    // MAL) y el año (NULL) se completan, y como no tenía portada, géneros ni
    // sinónimos, los recibe.
    expect(await row(KNOWN)).toEqual({
      title: 'Título Local',
      type: 'manhwa',
      status: 'finished',
      chapters: 40,
      volumes: 5,
      year: 2020,
      synopsis: 'Sinopsis',
    })
    expect(await count('manga_media', KNOWN)).toBe(2)
    expect(await count('manga_genre', KNOWN)).toBe(1)
    expect(await count('manga_title_synonym', KNOWN)).toBe(3)
  })

  test('T10: refresca los existentes sin pisar lo protegido y es idempotente', async () => {
    await cleanup()
    await db.execute(
      sql`INSERT INTO genre (mal_id, name) VALUES (2, 'Adventure')
          ON CONFLICT (mal_id) DO NOTHING`
    )
    await db.execute(
      sql`INSERT INTO manga (mal_id, title, type, title_english, status,
                             chapters, score, scored_by, members,
                             popularity_rank, ranking, favorites, background,
                             source, serialization)
          VALUES (${KNOWN}, 'Título Local', 'manhwa', 'Local EN', 'publishing',
                  5, 6.5, 3, 10, 99, 77, 8, 'BG', 'Fuente', 'Revista'),
                 (${KEPT}, 'Conservado', 'manga', NULL, 'publishing',
                  12, 8.25, 20, 30, 40, NULL, NULL, NULL, NULL, NULL)`
    )
    await db.execute(
      sql`UPDATE manga SET synopsis = 'Existente' WHERE mal_id = ${KEPT}`
    )
    await db.execute(
      sql`INSERT INTO manga_media (manga_id, media_type, src, size, source, priority)
          VALUES (${KEPT}, 'cover', 'https://local/kept.jpg', 'large', 'anilist', 10)`
    )
    await db.execute(
      sql`INSERT INTO manga_genre (manga_id, genre_id) VALUES (${KEPT}, 2)`
    )
    await db.execute(
      sql`INSERT INTO manga_title_synonym (manga_id, title)
          VALUES (${KEPT}, 'Sinónimo Local')`
    )
    const page = {
      nodes: [
        {
          id: KNOWN,
          title: 'Título MAL',
          main_picture: { large: `https://cdn.test/${KNOWN}l.jpg` },
          alternative_titles: { en: 'MAL EN', ja: 'ジャ', synonyms: ['S1'] },
          start_date: '2019-06-07',
          synopsis: 'Del ranking',
          media_type: 'manga',
          status: 'finished',
          genres: [{ id: 1, name: 'Action' }],
          num_chapters: 50,
          num_volumes: 6,
          popularity: 12,
          num_list_users: 9000,
          mean: 7.75,
          num_scoring_users: 800,
        },
        {
          id: KEPT,
          title: 'Otro Título',
          main_picture: { large: `https://cdn.test/${KEPT}l.jpg` },
          alternative_titles: { synonyms: ['Nuevo Sinónimo'] },
          synopsis: 'No debe entrar',
          status: 'finished',
          genres: [{ id: 1, name: 'Action' }],
          num_list_users: 31,
        },
        { id: UNKNOWN, title: 'Manga Nuevo', media_type: 'manga' },
      ],
    }

    // Solo cuenta el nuevo: el refresco no altera `inserted`.
    expect(await save(page)).toBe(1)

    const sheet = async (id: number) =>
      (
        await db.execute(
          sql`SELECT title, type, title_english, title_japanese, synopsis,
                     status, chapters, volumes, score, scored_by, members,
                     popularity_rank, ranking, favorites, year, background,
                     source, serialization,
                     published_from::date::text AS published_from,
                     published_to::date::text AS published_to
              FROM manga WHERE mal_id = ${id}`
        )
      ).rows[0]
    expect(await sheet(KNOWN)).toEqual({
      title: 'Título Local',
      type: 'manhwa',
      title_english: 'Local EN',
      title_japanese: 'ジャ',
      synopsis: 'Del ranking',
      status: 'finished',
      chapters: 50,
      volumes: 6,
      score: 7.75,
      scored_by: 800,
      members: 9000,
      popularity_rank: 12,
      ranking: 77,
      favorites: 8,
      year: 2019,
      background: 'BG',
      source: 'Fuente',
      serialization: 'Revista',
      published_from: '2019-06-07',
      published_to: null,
    })
    // Score de MAL nulo: se conserva el de la DB; sinopsis existente intacta.
    expect(await sheet(KEPT)).toEqual({
      title: 'Conservado',
      type: 'manga',
      title_english: null,
      title_japanese: null,
      synopsis: 'Existente',
      status: 'finished',
      chapters: 12,
      volumes: null,
      score: 8.25,
      scored_by: 20,
      members: 31,
      popularity_rank: 40,
      ranking: null,
      favorites: null,
      year: null,
      background: null,
      source: null,
      serialization: null,
      published_from: null,
      published_to: null,
    })

    const junctions = async (id: number) => ({
      media: (
        await db.execute(
          sql`SELECT src, source FROM manga_media WHERE manga_id = ${id} ORDER BY src`
        )
      ).rows,
      genres: (
        await db.execute(
          sql`SELECT genre_id FROM manga_genre WHERE manga_id = ${id} ORDER BY genre_id`
        )
      ).rows,
      synonyms: (
        await db.execute(
          sql`SELECT title FROM manga_title_synonym WHERE manga_id = ${id} ORDER BY title`
        )
      ).rows,
    })
    expect(await junctions(KNOWN)).toEqual({
      media: [{ src: `https://cdn.test/${KNOWN}l.jpg`, source: 'mal' }],
      genres: [{ genre_id: 1 }],
      synonyms: [{ title: 'MAL EN' }, { title: 'S1' }, { title: 'ジャ' }],
    })
    expect(await junctions(KEPT)).toEqual({
      media: [{ src: 'https://local/kept.jpg', source: 'anilist' }],
      genres: [{ genre_id: 2 }],
      synonyms: [{ title: 'Sinónimo Local' }],
    })
    expect((await row(UNKNOWN))?.title).toBe('Manga Nuevo')

    // Segunda pasada idéntica: nada cambia ni se reescribe (hash y xmin).
    const snapshot = async () =>
      (
        await db.execute(
          sql`SELECT mal_id, md5(m::text) AS hash, xmin::text AS xmin
              FROM manga m WHERE mal_id IN (${IDS}) ORDER BY mal_id`
        )
      ).rows
    const before = await snapshot()
    const junctionsBefore = [await junctions(KNOWN), await junctions(KEPT)]
    expect(await save(page)).toBe(0)
    expect(await snapshot()).toEqual(before)
    expect([await junctions(KNOWN), await junctions(KEPT)]).toEqual(
      junctionsBefore
    )
  })

  test('L18: MAL 0 no pisa capítulos/volúmenes; "" no pisa NULL; relaciones intactas', async () => {
    await cleanup()
    await db.execute(
      sql`INSERT INTO manga (mal_id, title, type, status, chapters, volumes)
          VALUES (${KNOWN}, 'Título Local', 'manhwa', 'publishing', 12, 3),
                 (${KEPT}, 'K', 'manga', NULL, NULL, NULL)`
    )
    await db.execute(
      sql`INSERT INTO manga_relation (manga_id, related_manga_id, relation_type)
          VALUES (${KNOWN}, ${KEPT}, 'SEQUEL')`
    )
    expect(
      await save({
        nodes: [
          {
            id: KNOWN,
            title: 'X',
            status: 'publishing',
            num_chapters: 0,
            num_volumes: 0,
          },
          {
            id: KEPT,
            title: 'Y',
            num_chapters: 0,
            num_volumes: 4,
            alternative_titles: { en: '', ja: '' },
          },
        ],
      })
    ).toBe(0)
    expect(await row(KNOWN)).toMatchObject({
      title: 'Título Local',
      type: 'manhwa',
      chapters: 12,
      volumes: 3,
    })
    expect(await row(KEPT)).toMatchObject({
      title: 'K',
      chapters: null,
      volumes: 4,
    })
    const titles = await db.execute(
      sql`SELECT title_english, title_japanese FROM manga WHERE mal_id = ${KEPT}`
    )
    expect(titles.rows[0]).toEqual({
      title_english: null,
      title_japanese: null,
    })
    const relations = await db.execute(
      sql`SELECT count(*)::int AS c FROM manga_relation WHERE manga_id = ${KNOWN}`
    )
    expect(relations.rows[0]).toEqual({ c: 1 })
  })
})
