import { describe, expect, test } from 'bun:test'
import {
  SINGLE_IP_SOURCES,
  SOURCES,
  SOURCE_HOSTS,
  getSourceConfig,
} from '../src/config/sources.js'

describe('config de fuentes', () => {
  test('cada fuente declara host y cuota (el RateGate los necesita)', () => {
    for (const source of SOURCES) {
      const entry = SOURCE_HOSTS[source.name]
      expect(entry, `falta SOURCE_HOSTS['${source.name}']`).toBeDefined()
      expect(entry?.host.length).toBeGreaterThan(0)
      expect(entry?.limits.perMinute).toBeGreaterThan(0)
    }
  })

  test('ninguna fuente sin proxy queda fuera de SINGLE_IP_SOURCES por error', () => {
    // TVDB es cuota por API key: repartirla entre IPs no multiplica nada.
    expect(SINGLE_IP_SOURCES.has('tvdbSeriesArtworks')).toBe(true)
    expect(SINGLE_IP_SOURCES.size).toBe(1)
  })

  test('modo backfill sube la concurrencia sin tocar la cuota por IP', () => {
    const before = getSourceConfig('jikanRelations')

    process.env.SCRAPER_MODE = 'backfill'
    process.env.SCRAPER_MAX_WORKERS = '4'
    const after = getSourceConfig('jikanRelations')
    delete process.env.SCRAPER_MODE
    delete process.env.SCRAPER_MAX_WORKERS

    expect(before.maxWorkers).toBeLessThan(after.maxWorkers)
    expect(after.maxWorkers).toBe(4)
    // La cuota es por IP: en backfill se usa la de la fuente (3/s, 60/min)
    expect(SOURCE_HOSTS.jikanRelations?.limits.perMinute).toBe(60)
  })

  test('source desconocido falla explícito', () => {
    expect(() => getSourceConfig('nope')).toThrow(/Unknown source/)
  })
})
