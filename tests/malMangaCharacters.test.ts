import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { PgDialect } from 'drizzle-orm/pg-core'
import { INCREMENTAL_GROUPS } from '../src/config/incremental.js'
import {
  REFRESH_POLICY,
  SOURCES,
  SOURCE_HOSTS,
  getSourceConfig,
} from '../src/config/sources.js'
import { SkippedTaskError } from '../src/libs/skippedTaskError.js'
import { processMalMangaCharacters } from '../src/processors/malMangaCharacters.js'
import {
  malCharacterPortraitSql,
  mangaCharacterLinkSql,
} from '../src/repositories/mal/characterWrites.js'
import { STALENESS_VIEWS } from '../src/repositories/tasks/stalenessSql.js'
import {
  fetchMalCharacters,
  fetchMalMangaCharacters,
  malCharactersUrl,
} from '../src/services/malCharacters.js'
import { parseMalCharactersPage } from '../src/shared/malCharactersHtml.js'
import { mangaCastTaskRows } from '../src/shared/mangaCastTasks.js'
import { buildPolicySeedRows } from '../src/shared/taskPolicy.js'
import type { ScrapingTask } from '../src/types/index.js'

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8')

const MANGA_HTML = fixture('mal-manga-characters.html')
const ANIME_HTML = fixture('mal-anime-characters.html')
const ANIME_PARSED = JSON.parse(fixture('mal-anime-characters.parsed.json'))

const dialect = new PgDialect()
const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
const task = (payload: Record<string, unknown>) =>
  ({ payload }) as unknown as ScrapingTask

const QUESTIONMARK = 'https://cdn.myanimelist.net/images/questionmark_23.gif'

describe('parseMalCharactersPage por medio (S2)', () => {
  test('manga: filas de js-manga-character-table con rol, favoritos y retrato', () => {
    expect(parseMalCharactersPage(MANGA_HTML, 'manga')).toEqual([
      {
        malId: 64769,
        name: 'Hinata, Shouyou',
        nativeName: null,
        role: 'Main',
        favourites: 19743,
        image: 'https://cdn.myanimelist.net/images/characters/11/243919.jpg',
        voiceActors: [],
      },
      {
        malId: 108343,
        name: 'Akaashi, Keiji',
        nativeName: null,
        role: 'Supporting',
        favourites: 2782,
        image: 'https://cdn.myanimelist.net/images/characters/8/417876.jpg',
        voiceActors: [],
      },
      {
        malId: 171882,
        name: 'Bessho, Kazuyoshi',
        nativeName: null,
        role: 'Supporting',
        favourites: 1,
        image: QUESTIONMARK,
        voiceActors: [],
      },
      {
        malId: 178921,
        name: 'Akane',
        nativeName: null,
        role: 'Supporting',
        favourites: 1,
        image: 'https://cdn.myanimelist.net/images/characters/6/402011.jpg',
        voiceActors: [],
      },
    ])
  })

  test('anime: salida idéntica a la del parser previo (fixture real)', () => {
    expect(parseMalCharactersPage(ANIME_HTML)).toEqual(ANIME_PARSED)
    expect(parseMalCharactersPage(ANIME_HTML, 'anime')).toEqual(ANIME_PARSED)
  })

  test('los selectores no se cruzan entre medios', () => {
    expect(parseMalCharactersPage(MANGA_HTML)).toEqual([])
    expect(parseMalCharactersPage(ANIME_HTML, 'manga')).toEqual([])
  })
})

describe('processMalMangaCharacters (S3)', () => {
  test('una fila por personaje con el id de MAL, sin nativo y sin interrogante', () => {
    const result = processMalMangaCharacters(
      { mangaId: 35243, html: MANGA_HTML },
      task({ mangaId: 35243 })
    )
    expect(result.mangaId).toBe(35243)
    expect(result.characters).toEqual([
      {
        mangaId: 35243,
        characterId: 64769,
        name: 'Hinata, Shouyou',
        nativeName: null,
        role: 'Main',
        image: 'https://cdn.myanimelist.net/images/characters/11/243919.jpg',
      },
      {
        mangaId: 35243,
        characterId: 108343,
        name: 'Akaashi, Keiji',
        nativeName: null,
        role: 'Supporting',
        image: 'https://cdn.myanimelist.net/images/characters/8/417876.jpg',
      },
      {
        mangaId: 35243,
        characterId: 171882,
        name: 'Bessho, Kazuyoshi',
        nativeName: null,
        role: 'Supporting',
        image: null,
      },
      {
        mangaId: 35243,
        characterId: 178921,
        name: 'Akane',
        nativeName: null,
        role: 'Supporting',
        image: 'https://cdn.myanimelist.net/images/characters/6/402011.jpg',
      },
    ])
  })
})

describe('SQL del escritor de reparto de manga (S3)', () => {
  test('manga_character: inserta sin pisar, solo para manga existentes', () => {
    const q = dialect.sqlToQuery(
      mangaCharacterLinkSql([
        { mangaId: 7, characterId: 3, role: 'Main' },
        { mangaId: 7, characterId: 4, role: 'Supporting' },
      ]) as never
    )
    expect(q.params).toEqual([7, 3, 'Main', 7, 4, 'Supporting'])
    const text = flat(q.sql)
    expect(text).toContain(
      'INSERT INTO manga_character (manga_id, character_id, role) SELECT v.manga_id, v.character_id, v.role'
    )
    expect(text).toContain('JOIN manga m ON m.mal_id = v.manga_id')
    expect(text).toContain('JOIN character c ON c.mal_id = v.character_id')
    expect(text).toContain('ON CONFLICT DO NOTHING')
    expect(text).not.toMatch(/\b(DELETE|UPDATE)\b/)
  })

  test('manga_character: sin vínculos no hay sentencia', () => {
    expect(mangaCharacterLinkSql([])).toBeNull()
  })

  test('retratos: poster de MAL con prioridad 20, sin reemplazar', () => {
    const q = dialect.sqlToQuery(
      malCharacterPortraitSql([{ id: 3, src: 'https://cdn/a.jpg' }]) as never
    )
    expect(q.params).toEqual([3, 'https://cdn/a.jpg'])
    const text = flat(q.sql)
    expect(text).toContain(
      'INSERT INTO character_media (character_id, media_type, src, size, source, priority)'
    )
    expect(text).toContain("SELECT v.id, 'poster', v.src, NULL, 'mal', 20")
    expect(text).toContain(
      'ON CONFLICT (character_id, media_type, src) DO NOTHING'
    )
    expect(malCharacterPortraitSql([])).toBeNull()
  })
})

describe('fetchMalMangaCharacters (S1)', () => {
  test('URL de la página de personajes con slug comodín', () => {
    expect(malCharactersUrl('manga', 35243)).toBe(
      'https://myanimelist.net/manga/35243/_/characters'
    )
    expect(malCharactersUrl('anime', 1)).toBe(
      'https://myanimelist.net/anime/1/_/characters'
    )
  })

  test('sin mangaId la tarea se omite', async () => {
    const error = await fetchMalMangaCharacters(task({})).catch((e) => e)
    expect(error).toBeInstanceOf(SkippedTaskError)
    expect((error as SkippedTaskError).reason).toBe('missing:mangaId')
  })

  test('anime: sin animeId la tarea se sigue omitiendo como antes', async () => {
    const error = await fetchMalCharacters(task({})).catch((e) => e)
    expect(error).toBeInstanceOf(SkippedTaskError)
    expect((error as SkippedTaskError).reason).toBe('missing:animeId')
  })
})

describe('siembra de tareas (S4)', () => {
  test('una tarea por manga sin tarea previa', () => {
    expect(mangaCastTaskRows([1, 2, 3], new Set(['manga_cast_2']))).toEqual([
      {
        source: 'malMangaCharacters',
        entityId: 'manga_cast_1',
        taskType: 'manga_mal_characters_hydration',
        priority: 10,
        status: 'pending',
        payload: { mangaId: 1 },
      },
      {
        source: 'malMangaCharacters',
        entityId: 'manga_cast_3',
        taskType: 'manga_mal_characters_hydration',
        priority: 10,
        status: 'pending',
        payload: { mangaId: 3 },
      },
    ])
  })
})

describe('config de la fuente (S1, S4, S6)', () => {
  test('misma cuota, lotes y tope que el reparto de anime', () => {
    const manga = SOURCES.find((s) => s.name === 'malMangaCharacters')
    const anime = SOURCES.find((s) => s.name === 'malCharacters')
    expect(manga?.tasks).toEqual({
      manga_mal_characters_hydration: {
        entity: 'malMangaCharacters',
        needsPayload: true,
      },
    })
    expect(manga?.maxWorkers).toBe(anime?.maxWorkers as number)
    expect(manga?.pageBatch).toBe(anime?.pageBatch as number)
    expect(manga?.taskBatchSize).toBe(anime?.taskBatchSize as number)
    expect(manga?.rateLimit).toEqual(anime?.rateLimit as never)
    expect(SOURCE_HOSTS.malMangaCharacters).toEqual({
      host: 'myanimelist.net',
      limits: SOURCE_HOSTS.malCharacters!.limits,
    })

    process.env.SCRAPER_MODE = 'backfill'
    const backfillManga = getSourceConfig('malMangaCharacters')
    const backfillAnime = getSourceConfig('malCharacters')
    delete process.env.SCRAPER_MODE
    expect(backfillManga.maxWorkers).toBe(backfillAnime.maxWorkers)
    expect(backfillManga.rateLimit).toEqual(backfillAnime.rateLimit)
  })

  test('grupo slow y refresco cold de 180 días', () => {
    expect(INCREMENTAL_GROUPS.slow).toContain('malMangaCharacters')
    expect(INCREMENTAL_GROUPS.hot).not.toContain('malMangaCharacters')
    expect(REFRESH_POLICY.manga_mal_characters_hydration).toEqual({
      cold: 180 * 86400,
      hot: null,
    })
    expect(
      buildPolicySeedRows().find(
        (r) => r.taskType === 'manga_mal_characters_hydration'
      )
    ).toEqual({
      source: 'malMangaCharacters',
      taskType: 'manga_mal_characters_hydration',
      refreshIntervalSeconds: 180 * 86400,
      refreshIntervalAiringSeconds: null,
      maxAttempts: 3,
      priority: 0,
    })
  })
})

describe('reporte (S5)', () => {
  test('E: cola por tipo de tarea de las fuentes slow', () => {
    const e = dialect.sqlToQuery(STALENESS_VIEWS[4]!.query)
    expect(e.params).toEqual(expect.arrayContaining(INCREMENTAL_GROUPS.slow))
    expect(e.params).toContain('malMangaCharacters')
    const text = flat(e.sql)
    expect(text).toContain('SELECT source, task_type')
    expect(text).toContain('GROUP BY source, task_type')
  })
})
