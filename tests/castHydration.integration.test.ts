import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { db } from '../src/libs/db.js'
import { processAnilistMedia } from '../src/processors/anilistMedia.js'
import { anilistMediaRepository } from '../src/repositories/anilistMedia.js'
import { anilistRepository } from '../src/repositories/anilist.js'
import { malCharactersRepository } from '../src/repositories/malCharacters.js'
import { malPersonRepository } from '../src/repositories/malPerson.js'
import type {
  AniListCharacterEdge,
  AniListMediaDeep,
} from '../src/services/anilistMedia.js'
import type { ScrapingTask } from '../src/types/index.js'

/**
 * Integración del reparto (S1–S8) contra Postgres local (RUN_DB_TESTS=1):
 * pase profundo de AniList, escritores de MAL y parche solo-relleno.
 * Ids en el rango 99xxxx (y 1e9 + 99xxxx para los solo-AniList).
 */
const RUN = Boolean(process.env.RUN_DB_TESTS)

const ANIME = 990001 // medio de la tarea
const OTHER_ANIME = 990002 // tiene un "Narrator" homónimo
const RELATED_ANIME = 990003
const MANGA = 990101
const RELATED_MANGA = 990102
const AQUA = 990501 // ya tiene anilist_id 995001
const KAZUMA = 990502 // "Satou, Kazuma" (MAL)
const NARRATOR = 990503 // homónimo, solo en OTHER_ANIME
const ANILIST_BASE = 1_000_000_000
const ANIME_IDS = [ANIME, OTHER_ANIME, RELATED_ANIME, 990701]
const MANGA_IDS = [MANGA, RELATED_MANGA]
const CHARACTER_FILTER = sql`(mal_id BETWEEN 990000 AND 999999 OR mal_id BETWEEN ${ANILIST_BASE + 990000} AND ${ANILIST_BASE + 999999})`

const cleanup = async () => {
  await db.execute(sql`DELETE FROM character WHERE ${CHARACTER_FILTER}`)
  await db.execute(
    sql`DELETE FROM anime WHERE mal_id IN (${sql.join(ANIME_IDS.map((id) => sql`${id}`), sql`, `)})`
  )
  await db.execute(
    sql`DELETE FROM manga WHERE mal_id IN (${sql.join(MANGA_IDS.map((id) => sql`${id}`), sql`, `)})`
  )
}

const rows = async <T>(query: ReturnType<typeof sql>): Promise<T[]> =>
  (await db.execute(query)).rows as T[]

const task = (mediaId: number, mediaType: 'ANIME' | 'MANGA' = 'ANIME') =>
  ({ payload: { anilistId: 1, mediaId, mediaType } }) as unknown as ScrapingTask

const edge = (
  id: number,
  role: string,
  full: string,
  image: string | null = null,
  native: string | null = null
): AniListCharacterEdge =>
  ({
    role,
    node: {
      id,
      name: { full, native, alternative: [] },
      image: image ? { large: image } : null,
      description: null,
      gender: null,
      dateOfBirth: null,
      bloodType: null,
      age: null,
      favourites: null,
    },
    voiceActors: [],
  }) as unknown as AniListCharacterEdge

const deep = (
  idMal: number,
  type: 'ANIME' | 'MANGA',
  edges: AniListCharacterEdge[],
  relations: AniListMediaDeep['relations']['edges']
): AniListMediaDeep => ({
  id: idMal + 100_000,
  idMal,
  type,
  characters: { pageInfo: { total: edges.length, hasNextPage: false }, edges },
  staff: { pageInfo: { total: 0, hasNextPage: false }, edges: [] },
  relations: { edges: relations },
  externalLinks: [],
})

const POSTER = 'https://s4.anilist.co/file/anilistcdn/character/large/b995002.png'
const DEFAULT_POSTER =
  'https://s4.anilist.co/file/anilistcdn/character/large/default.jpg'

describe.skipIf(!RUN)('pase profundo de AniList (Postgres local)', () => {
  beforeAll(async () => {
    await cleanup()
    await db.execute(sql`
      INSERT INTO anime (mal_id, title) VALUES
        (${ANIME}, 'Cast Test'), (${OTHER_ANIME}, 'Namesake Test'),
        (${RELATED_ANIME}, 'Sequel Test')
    `)
    await db.execute(sql`
      INSERT INTO manga (mal_id, title) VALUES
        (${MANGA}, 'Manga Test'), (${RELATED_MANGA}, 'Manga Side Test')
    `)
    await db.execute(sql`
      INSERT INTO character (mal_id, name) VALUES
        (${AQUA}, 'Aqua'), (${KAZUMA}, 'Satou, Kazuma'), (${NARRATOR}, 'Narrator')
    `)
    await db.execute(sql`
      INSERT INTO character_external (character_id, mal_id, anilist_id, created_at, updated_at)
      VALUES (${AQUA}, ${AQUA}, 995001, now(), now())
    `)
    await db.execute(sql`
      INSERT INTO anime_character (anime_id, character_id, role) VALUES
        (${ANIME}, ${AQUA}, 'Main'), (${ANIME}, ${KAZUMA}, 'Main'),
        (${OTHER_ANIME}, ${NARRATOR}, 'Supporting')
    `)
    await db.execute(sql`
      INSERT INTO character_media (character_id, media_type, src, size, source, priority)
      VALUES (${AQUA}, 'poster', 'https://cdn.myanimelist.net/aqua.jpg', NULL, 'mal', 20)
    `)

    const animeEdges = [
      // Mismo personaje por anilist_id aunque el nombre no coincida.
      edge(995001, 'MAIN', 'Aqua Goddess', 'https://s4.anilist.co/x/aqua.png'),
      // Por nombre con vocal larga e inversión: "Satou, Kazuma" ↔ "Kazuma Sato".
      edge(995002, 'SUPPORTING', 'Kazuma Sato', POSTER, '佐藤和真'),
      // Homónimo global: el "Narrator" de OTHER_ANIME no es candidato.
      edge(995003, 'BACKGROUND', 'Narrator', DEFAULT_POSTER),
    ]
    const results = [
      processAnilistMedia(
        {
          mediaType: 'ANIME',
          media: deep(ANIME, 'ANIME', animeEdges, [
            { relationType: 'SEQUEL', node: { id: 1, idMal: RELATED_ANIME, type: 'ANIME' } },
            { relationType: 'SIDE_STORY', node: { id: 2, idMal: MANGA, type: 'MANGA' } },
          ]),
        },
        task(ANIME)
      ),
      processAnilistMedia(
        {
          mediaType: 'MANGA',
          media: deep(MANGA, 'MANGA', [edge(995004, 'MAIN', 'Manga Hero')], [
            { relationType: 'SIDE_STORY', node: { id: 3, idMal: RELATED_MANGA, type: 'MANGA' } },
          ]),
        },
        task(MANGA, 'MANGA')
      ),
    ]
    // idMal distinto al de la tarea: no se escribe nada para OTHER_ANIME.
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    results.push(
      processAnilistMedia(
        {
          mediaType: 'ANIME',
          media: deep(123456, 'ANIME', [edge(995005, 'MAIN', 'Wrong Cast')], []),
        },
        task(OTHER_ANIME)
      )
    )
    warn.mockRestore()

    await anilistMediaRepository.saveAnilistMedia(results)
    // Segunda pasada: idempotente.
    await anilistMediaRepository.saveAnilistMedia(results)
  })

  afterAll(cleanup)

  test('S1/S3: empareja dentro del reparto por anilist_id y por nombre, roles MAL', async () => {
    const cast = await rows<{ character_id: number; role: string }>(sql`
      SELECT character_id, role FROM anime_character
      WHERE anime_id = ${ANIME} ORDER BY character_id, role
    `)
    expect(cast).toEqual([
      { character_id: AQUA, role: 'Main' },
      { character_id: KAZUMA, role: 'Main' },
      { character_id: KAZUMA, role: 'Supporting' },
      { character_id: ANILIST_BASE + 995003, role: 'Background' },
    ])
  })

  test('S1: el homónimo de otro anime no se enlaza', async () => {
    const narrator = await rows<{ anime_id: number }>(sql`
      SELECT anime_id FROM anime_character WHERE character_id = ${NARRATOR}
    `)
    expect(narrator).toEqual([{ anime_id: OTHER_ANIME }])
  })

  test('S2: sin pareja → 1e9 + id y character_external; con pareja → anilist_id libre', async () => {
    const external = await rows<{
      character_id: number
      mal_id: number | null
      anilist_id: number | null
    }>(sql`
      SELECT character_id, mal_id, anilist_id FROM character_external
      WHERE character_id IN (${AQUA}, ${KAZUMA}, ${NARRATOR}, ${ANILIST_BASE + 995003}, ${ANILIST_BASE + 995004})
      ORDER BY character_id
    `)
    expect(external).toEqual([
      { character_id: AQUA, mal_id: AQUA, anilist_id: 995001 },
      { character_id: KAZUMA, mal_id: null, anilist_id: 995002 },
      { character_id: ANILIST_BASE + 995003, mal_id: null, anilist_id: 995003 },
      { character_id: ANILIST_BASE + 995004, mal_id: null, anilist_id: 995004 },
    ])
    const created = await rows<{ mal_id: number; name: string; anilist_id: number | null }>(sql`
      SELECT mal_id, name, anilist_id FROM character
      WHERE mal_id IN (${ANILIST_BASE + 995003}, ${KAZUMA}) ORDER BY mal_id
    `)
    // Nunca se escribe character.anilist_id.
    expect(created).toEqual([
      { mal_id: KAZUMA, name: 'Satou, Kazuma', anilist_id: null },
      { mal_id: ANILIST_BASE + 995003, name: 'Narrator', anilist_id: null },
    ])
  })

  test('S5: retrato de AniList solo si falta poster y nunca el placeholder', async () => {
    const media = await rows<{
      character_id: number
      src: string
      size: string | null
      source: string
      priority: number
    }>(sql`
      SELECT character_id, src, size, source, priority FROM character_media
      WHERE character_id IN (${AQUA}, ${KAZUMA}, ${ANILIST_BASE + 995003})
      ORDER BY character_id
    `)
    expect(media).toEqual([
      { character_id: AQUA, src: 'https://cdn.myanimelist.net/aqua.jpg', size: null, source: 'mal', priority: 20 },
      { character_id: KAZUMA, src: POSTER, size: null, source: 'anilist', priority: 30 },
    ])
  })

  test('S6: idMal distinto → nada escrito; relaciones en el vocabulario de cada medio', async () => {
    const wrong = await rows<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM character WHERE mal_id = ${ANILIST_BASE + 995005}
    `)
    expect(wrong[0]?.n).toBe(0)

    expect(
      await rows(sql`
        SELECT related_anime_id, relation_type FROM anime_relation WHERE anime_id = ${ANIME}
      `)
    ).toEqual([{ related_anime_id: RELATED_ANIME, relation_type: 'Sequel' }])
    expect(
      await rows(sql`
        SELECT related_manga_id, relation_type FROM manga_relation WHERE manga_id = ${MANGA}
      `)
    ).toEqual([{ related_manga_id: RELATED_MANGA, relation_type: 'SIDE_STORY' }])
    expect(
      await rows(sql`SELECT character_id, role FROM manga_character WHERE manga_id = ${MANGA}`)
    ).toEqual([{ character_id: ANILIST_BASE + 995004, role: 'Main' }])
  })
})

describe.skipIf(!RUN)('escritores de MAL y parche de AniList (Postgres local)', () => {
  beforeAll(async () => {
    await cleanup()
    await db.execute(sql`INSERT INTO anime (mal_id, title) VALUES (${ANIME}, 'MAL Test')`)
    await db.execute(sql`
      INSERT INTO character (mal_id, name, name_kanji) VALUES
        (990601, 'Old Romaji', 'Satou Kazuma'),
        (990603, 'Real Native', '本物'),
        (990604, 'Personaje 990604', 'Romaji Person')
    `)
    await db.execute(sql`
      INSERT INTO character_external (character_id, mal_id, anilist_id, created_at, updated_at)
      VALUES (990601, NULL, 997001, now(), now())
    `)
  })

  afterAll(cleanup)

  test('S4/S8: página de personajes: nativo solo no-ASCII, romaji limpiado, mal_id externo', async () => {
    const character = (characterId: number, nativeName: string | null) => ({
      animeId: ANIME,
      characterId,
      name: `Character ${characterId}`,
      nativeName,
      role: 'Main',
      favourites: 0,
      image: null,
    })
    await malCharactersRepository.saveMalCharacters([
      {
        animeId: ANIME,
        characters: [
          character(990601, null),
          character(990602, '佐藤'),
          character(990603, 'Romaji Only'),
        ],
        voiceActors: [],
      },
    ])

    expect(
      await rows(sql`
        SELECT mal_id, name_kanji FROM character
        WHERE mal_id IN (990601, 990602, 990603) ORDER BY mal_id
      `)
    ).toEqual([
      { mal_id: 990601, name_kanji: null },
      { mal_id: 990602, name_kanji: '佐藤' },
      { mal_id: 990603, name_kanji: '本物' },
    ])
    expect(
      await rows(sql`
        SELECT character_id, mal_id, anilist_id FROM character_external
        WHERE character_id IN (990601, 990602, 990603) ORDER BY character_id
      `)
    ).toEqual([
      { character_id: 990601, mal_id: 990601, anilist_id: 997001 },
      { character_id: 990602, mal_id: 990602, anilist_id: null },
      { character_id: 990603, mal_id: 990603, anilist_id: null },
    ])
  })

  test('S4/S8: ficha de persona: romaji fuera de name_kanji y mal_id externo', async () => {
    await malPersonRepository.saveMalPerson([
      {
        kind: 'character',
        id: 990604,
        name: 'Person Character',
        givenName: null,
        familyName: null,
        nativeName: 'Romaji Again',
        about: 'About',
        birthday: null,
        imageUrl: null,
        alternativeNames: [],
      },
    ] as never)

    expect(
      await rows(sql`SELECT name, name_kanji, about FROM character WHERE mal_id = 990604`)
    ).toEqual([{ name: 'Person Character', name_kanji: null, about: 'About' }])
    expect(
      await rows(sql`SELECT mal_id FROM character_external WHERE character_id = 990604`)
    ).toEqual([{ mal_id: 990604 }])
  })

  test('S7: el parche de AniList solo rellena lo vacío', async () => {
    await db.execute(sql`
      INSERT INTO anime (mal_id, title, synopsis, source, trailer_youtube_id)
      VALUES (990701, 'Patch Test', 'MAL synopsis', NULL, '')
    `)
    await anilistRepository.saveAnimeBanners([
      {
        animeMedias: [],
        animePatch: {
          malId: 990701,
          synopsis: 'AniList synopsis',
          source: 'Manga',
          trailerYoutubeId: 'abc123',
        },
      },
    ] as never)

    expect(
      await rows(sql`
        SELECT synopsis, source, trailer_youtube_id FROM anime WHERE mal_id = 990701
      `)
    ).toEqual([
      { synopsis: 'MAL synopsis', source: 'Manga', trailer_youtube_id: 'abc123' },
    ])
  })
})
