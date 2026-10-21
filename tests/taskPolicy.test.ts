import { describe, expect, test } from 'bun:test'
import { DEFAULT_REFRESH_SECONDS } from '../src/config/sources.js'
import { buildPolicySeedRows } from '../src/shared/taskPolicy.js'

describe('buildPolicySeedRows (siembra de ingest.task_policy)', () => {
  test('cubre todos los taskTypes con defaults y cada uno mapea a su fuente', () => {
    const rows = buildPolicySeedRows()

    expect(rows).toHaveLength(Object.keys(DEFAULT_REFRESH_SECONDS).length)
    expect(rows.length).toBeGreaterThan(10)

    for (const row of rows) {
      expect(row.source).toBeTruthy()
      expect(row.taskType).toBeTruthy()
      expect(row.refreshIntervalSeconds).toBeGreaterThan(0)
      // Sin condición "hot" no se siembra airing (ver doc del builder).
      expect(row.refreshIntervalAiringSeconds).toBeNull()
      expect(row.maxAttempts).toBe(3)
    }

    const byType = Object.fromEntries(rows.map((r) => [r.taskType, r.source]))
    expect(byType['anime_page_hydration']).toBe('jikan')
    expect(byType['anime_details_hydration']).toBe('jikanRelations')
    expect(byType['anime_themes_hydration']).toBe('animeThemes')
    expect(byType['anime_mapping_hydration']).toBe('animeMapping')
    expect(byType['anime_episodes_hydration']).toBe('animeEpisodes')
    expect(byType['tvdb_series_artworks']).toBe('tvdbSeriesArtworks')
    expect(byType['anime_banner_hydration']).toBe('anilist')
  })
})
