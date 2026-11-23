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
import { malDiscoveryListUrl } from '../src/services/malDiscovery.js'
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

  test('URL: manga/ranking, limit 500, offset, campos mínimos y nsfw', () => {
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
    expect(parsed.searchParams.get('fields')?.split(',')).toEqual([
      'id',
      'title',
      'media_type',
      'status',
      'num_chapters',
      'num_volumes',
      'start_date',
    ])
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
