import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { processMalRanking } from '../src/processors/mal.js'
import {
  insertUnknownAnimeSql,
  minimalAnimeRows,
} from '../src/repositories/mal/discoverySql.js'
import { malSeasonAt } from '../src/shared/malSeason.js'
import { MAL_DISCOVERY_TASKS } from '../src/config/malDiscovery.js'
import { malDiscoveryListUrl } from '../src/services/malDiscovery.js'
import type { ScrapingTask } from '../src/types/index.js'

const dialect = new PgDialect()
const task = { entityId: 'mal_discovery_ranking_upcoming' } as ScrapingTask

const ranking = processMalRanking(
  {
    nodes: [
      {
        id: 61001,
        title: 'Nuevo Anime',
        media_type: 'tv',
        status: 'not_yet_aired',
        num_episodes: 12,
        start_season: { year: 2027, season: 'winter' },
      },
      { id: 61002, media_type: 'movie' }, // sin título: no se inserta
      { id: 61003, title: '  ' }, // título vacío: tampoco
    ],
  },
  task
).results

describe('S1 · el processor lleva el título y el SQL inserta desconocidos', () => {
  test('processMalRanking conserva el título de MAL', () => {
    expect(ranking[0]?.animeStats?.title).toBe('Nuevo Anime')
    expect(ranking[1]?.animeStats?.title).toBeUndefined()
  })

  test('filas mínimas mapeadas con TYPE/STATUS y sin nodos sin título', () => {
    expect(minimalAnimeRows(ranking)).toEqual([
      {
        malId: 61001,
        title: 'Nuevo Anime',
        type: 'TV',
        status: 'Not yet aired',
        episodes: 12,
        year: 2027,
        season: 'winter',
      },
    ])
  })

  test('INSERT … ON CONFLICT (mal_id) DO NOTHING, sin tocar títulos existentes', () => {
    const { sql, params } = dialect.sqlToQuery(
      insertUnknownAnimeSql(minimalAnimeRows(ranking))
    )
    const text = sql.replace(/\s+/g, ' ')
    expect(text).toContain(
      'INSERT INTO anime (mal_id, title, type, status, episodes, year, season)'
    )
    expect(text).toContain('ON CONFLICT (mal_id) DO NOTHING')
    expect(text).not.toMatch(/DO UPDATE|UPDATE anime/i)
    expect(params).toEqual([
      61001,
      'Nuevo Anime',
      'TV',
      'Not yet aired',
      12,
      2027,
      'winter',
    ])
  })
})

describe('S2 · temporadas de MAL (límites de año)', () => {
  const at = (iso: string, offset = 0) => malSeasonAt(new Date(iso), offset)

  test('winter = ene–mar, spring = abr–jun, summer = jul–sep, fall = oct–dic', () => {
    expect(at('2027-01-01T00:00:00Z')).toEqual({ year: 2027, season: 'winter' })
    expect(at('2027-03-31T23:59:59Z')).toEqual({ year: 2027, season: 'winter' })
    expect(at('2027-04-01T00:00:00Z')).toEqual({ year: 2027, season: 'spring' })
    expect(at('2027-07-15T00:00:00Z')).toEqual({ year: 2027, season: 'summer' })
    expect(at('2026-12-31T23:59:59Z')).toEqual({ year: 2026, season: 'fall' })
  })

  test('la siguiente de fall Y es winter Y+1', () => {
    expect(at('2026-11-23T00:00:00Z', 1)).toEqual({
      year: 2027,
      season: 'winter',
    })
    expect(at('2027-02-10T00:00:00Z', 1)).toEqual({
      year: 2027,
      season: 'spring',
    })
  })
})

describe('S2 · tareas y URLs de malDiscovery', () => {
  test('siembra temporada actual/siguiente, rankings upcoming/airing y manga (S6)', () => {
    expect(MAL_DISCOVERY_TASKS.map((t) => [t.entityId, t.payload])).toEqual([
      ['mal_discovery_season_current', { seasonOffset: 0 }],
      ['mal_discovery_season_next', { seasonOffset: 1 }],
      ['mal_discovery_ranking_upcoming', { rankingType: 'upcoming' }],
      ['mal_discovery_ranking_airing', { rankingType: 'airing' }],
      [
        'mal_discovery_manga_ranking_bypopularity',
        { rankingType: 'bypopularity' },
      ],
    ])
    for (const t of MAL_DISCOVERY_TASKS) expect(t.source).toBe('malDiscovery')
  })

  test('URL de temporada: limit 500, offset, fields del ranking y nsfw', () => {
    const url = malDiscoveryListUrl(
      'https://api.myanimelist.net/v2',
      { kind: 'season', year: 2027, season: 'winter' },
      500
    )
    expect(url).toStartWith(
      'https://api.myanimelist.net/v2/anime/season/2027/winter?'
    )
    const query = new URL(url).searchParams
    expect(query.get('limit')).toBe('500')
    expect(query.get('offset')).toBe('500')
    expect(query.get('nsfw')).toBe('true')
    expect(query.get('fields')).toContain('num_episodes')
    expect(query.get('fields')).toContain('start_season')
  })

  test('URL de ranking upcoming', () => {
    const url = malDiscoveryListUrl(
      'https://api.myanimelist.net/v2',
      { kind: 'ranking', rankingType: 'upcoming' },
      0
    )
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/v2/anime/ranking')
    expect(parsed.searchParams.get('ranking_type')).toBe('upcoming')
    expect(parsed.searchParams.get('offset')).toBe('0')
    expect(parsed.searchParams.get('nsfw')).toBe('true')
  })
})
