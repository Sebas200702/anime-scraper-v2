import { describe, expect, test } from 'bun:test'
import { REFRESH_POLICY } from '../src/config/sources.js'
import { buildPolicySeedRows } from '../src/shared/taskPolicy.js'

describe('buildPolicySeedRows (siembra de ingest.task_policy)', () => {
  test('cubre todos los taskTypes con la política y cada uno mapea a su fuente', () => {
    const rows = buildPolicySeedRows()

    expect(rows).toHaveLength(Object.keys(REFRESH_POLICY).length)
    expect(rows.length).toBeGreaterThan(10)

    for (const row of rows) {
      expect(row.source).toBeTruthy()
      expect(row.taskType).toBeTruthy()
      expect(row.maxAttempts).toBe(3)
      // `null` es válido (nunca se refresca); lo que no puede es ser <= 0.
      for (const seconds of [
        row.refreshIntervalSeconds,
        row.refreshIntervalAiringSeconds,
      ]) {
        if (seconds !== null) expect(seconds).toBeGreaterThan(0)
      }
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

  test('el listado y el catálogo terminado no se refrescan (sin re-barrido)', () => {
    const rows = Object.fromEntries(
      buildPolicySeedRows().map((r) => [r.taskType, r])
    )

    // Discovery puro: las páginas solo se crean cuando aparecen nuevas.
    expect(rows['anime_page_hydration']).toMatchObject({
      refreshIntervalSeconds: null,
      refreshIntervalAiringSeconds: null,
    })

    // Ficha y episodios: airing sí, terminado nunca (salvo cierre de temporada).
    expect(rows['anime_details_hydration']).toMatchObject({
      refreshIntervalSeconds: null,
      refreshIntervalAiringSeconds: 24 * 3600,
    })
    expect(rows['anime_episodes_hydration']).toMatchObject({
      refreshIntervalSeconds: null,
      refreshIntervalAiringSeconds: 24 * 3600,
    })
  })
})
