import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  MAL_DISCOVERY_MANGA_RANKING_TASK,
  MAL_DISCOVERY_TASKS,
} from '../src/config/malDiscovery.js'
import { REFRESH_POLICY, SOURCES } from '../src/config/sources.js'
import { processMalDiscoveryMangaRanking } from '../src/processors/malDiscovery.js'
import { insertUnknownMangaSql } from '../src/repositories/mal/mangaDiscoverySql.js'
import { DERIVED_SOURCES } from '../src/scripts/initializers.js'
import { processMalManga } from '../src/processors/malManga.js'
import {
  MANGA_DISCOVERY_FIELDS,
  malDiscoveryListUrl,
} from '../src/services/malDiscovery.js'
import type { ScrapingTask } from '../src/types/index.js'

const dialect = new PgDialect()
const task = {
  entityId: 'mal_discovery_manga_ranking_bypopularity',
} as ScrapingTask

const { rows } = processMalDiscoveryMangaRanking(
  {
    nodes: [
      {
        id: 171001,
        title: 'Nueva Novela',
        media_type: 'light_novel',
        status: 'currently_publishing',
        num_chapters: 0,
        num_volumes: 3,
        start_date: '2026-04-01',
      },
      { id: 171002, title: 'Sin Tipo' }, // sin media_type: 'manga'
      { id: 171003, media_type: 'manga' }, // sin título: no se inserta
      { id: 171004, title: '   ' }, // título vacío: tampoco
      { id: 171001, title: 'Duplicado' }, // id repetido: cuenta una vez
    ],
  },
  task
)

describe('S6 · filas mínimas de manga desde el ranking de MAL', () => {
  test('mapeo con el vocabulario de malManga; sin títulos vacíos ni duplicados', () => {
    expect(rows).toEqual([
      {
        malId: 171001,
        title: 'Nueva Novela',
        type: 'light_novel',
        status: 'currently_publishing',
        chapters: 0,
        volumes: 3,
        year: 2026,
      },
      {
        malId: 171002,
        title: 'Sin Tipo',
        type: 'manga',
        status: null,
        chapters: null,
        volumes: null,
        year: null,
      },
    ])
  })

  test('INSERT … ON CONFLICT (mal_id) DO NOTHING, sin pisar filas existentes', () => {
    const query = dialect.sqlToQuery(insertUnknownMangaSql(rows))
    const text = query.sql.replace(/\s+/g, ' ')
    expect(text).toContain(
      'INSERT INTO manga (mal_id, title, type, status, chapters, volumes, year)'
    )
    expect(text).toContain('ON CONFLICT (mal_id) DO NOTHING')
    expect(text).not.toMatch(/DO UPDATE|UPDATE manga/i)
    expect(query.params).toEqual([
      171001,
      'Nueva Novela',
      'light_novel',
      'currently_publishing',
      0,
      3,
      2026,
      171002,
      'Sin Tipo',
      'manga',
      null,
      null,
      null,
      null,
    ])
  })
})

describe('S6 · tarea, URL y política del ranking de manga', () => {
  test('una sola tarea: ranking bypopularity de manga en malDiscovery', () => {
    const manga = MAL_DISCOVERY_TASKS.filter(
      (t) => t.taskType === MAL_DISCOVERY_MANGA_RANKING_TASK
    )
    expect(MAL_DISCOVERY_MANGA_RANKING_TASK).toBe(
      'manga_mal_discovery_ranking_hydration'
    )
    expect(manga.map((t) => [t.source, t.entityId, t.payload])).toEqual([
      [
        'malDiscovery',
        'mal_discovery_manga_ranking_bypopularity',
        { rankingType: 'bypopularity' },
      ],
    ])
  })

  test('URL: manga/ranking, limit 500, offset, campos del ranking (L12) y nsfw', () => {
    const url = malDiscoveryListUrl(
      'https://api.myanimelist.net/v2',
      { kind: 'mangaRanking', rankingType: 'bypopularity' },
      1000
    )
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/v2/manga/ranking')
    expect(parsed.searchParams.get('ranking_type')).toBe('bypopularity')
    expect(parsed.searchParams.get('limit')).toBe('500')
    expect(parsed.searchParams.get('offset')).toBe('1000')
    expect(parsed.searchParams.get('nsfw')).toBe('true')
    expect(parsed.searchParams.get('fields')).toBe(MANGA_DISCOVERY_FIELDS)
  })

  test('declarado en malDiscovery con refresco semanal (7 d menos 4 h)', () => {
    const config = SOURCES.find((s) => s.name === 'malDiscovery')
    expect(config?.tasks[MAL_DISCOVERY_MANGA_RANKING_TASK]).toEqual({
      entity: 'malDiscoveryMangaRanking',
      needsPayload: true,
    })
    expect(REFRESH_POLICY[MAL_DISCOVERY_MANGA_RANKING_TASK]).toEqual({
      cold: (7 * 24 - 4) * 3600,
      hot: (7 * 24 - 4) * 3600,
    })
  })

  test('los manga nuevos reciben sus tareas: malManga y su reparto son derivados', () => {
    for (const source of ['malManga', 'malMangaCharacters', 'malMangaPage'])
      expect(DERIVED_SOURCES).toContain(source)
  })
})

describe('L12 · el ranking de manga trae la ficha que MAL acepta en listas', () => {
  test('pide los campos de la ficha disponibles en el endpoint de ranking', () => {
    expect(MANGA_DISCOVERY_FIELDS.split(',')).toEqual([
      'id',
      'title',
      'main_picture',
      'alternative_titles',
      'start_date',
      'end_date',
      'synopsis',
      'media_type',
      'status',
      'genres',
      'num_chapters',
      'num_volumes',
      'popularity',
      'num_list_users',
      'mean',
      'num_scoring_users',
    ])
  })

  test('arrastra la ficha completa de cada nodo con título', () => {
    const { details } = processMalDiscoveryMangaRanking(
      {
        nodes: [
          { id: 171101, title: 'Con Ficha', synopsis: 'S', mean: 8 },
          { id: 171102 }, // sin título: sin ficha
        ],
      },
      task
    )
    expect(details.map((d) => [d.manga.malId, d.manga.synopsis])).toEqual([
      [171101, 'S'],
    ])
  })

  test('miembros y votos salen de num_list_users / num_scoring_users (API v2)', () => {
    const { manga } = processMalManga(
      {
        mangaId: 171103,
        node: { id: 171103, num_list_users: 42, num_scoring_users: 7 },
      },
      task
    )
    expect([manga.members, manga.scoredBy]).toEqual([42, 7])
  })

  test('members/scored_by: el fallback solo aplica si members falta', () => {
    const p = (node: object) =>
      processMalManga({ mangaId: 1, node: { id: 1, ...node } }, task).manga
    expect([
      p({ members: 0, num_list_users: 9 }).members,
      p({ members: null, num_list_users: 9 } as never).members,
    ]).toEqual([0, 9])
    expect([p({}).members, p({}).scoredBy]).toEqual([null, null])
  })

  test('tolera todos los campos de lista en null', () => {
    const node = {
      id: 2,
      title: 'N',
      main_picture: null,
      alternative_titles: null,
      genres: null,
      start_date: null,
      num_list_users: null,
    } as never
    const { details } = processMalDiscoveryMangaRanking({ nodes: [node] }, task)
    expect(details[0]?.media).toEqual([])
    expect(details[0]?.manga.type).toBe('manga')
  })
})
