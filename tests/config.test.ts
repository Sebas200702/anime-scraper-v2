import { describe, expect, test } from 'bun:test'
import {
  KEY_SCOPED_HOSTS,
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

  test('las fuentes con cuota por API key van directas y con gate global', () => {
    // Paralelizar entre IPs no multiplica la cuota de una API key y sí la
    // rompería: el gate las trata como una sola clave y no consumen el tope de
    // conexiones del proveedor (van sin proxy).
    expect(KEY_SCOPED_HOSTS.has('api4.thetvdb.com')).toBe(true)
    expect(KEY_SCOPED_HOSTS.has('api.myanimelist.net')).toBe(true)
    expect(SINGLE_IP_SOURCES.has('mal')).toBe(true)
    expect(SINGLE_IP_SOURCES.has('tvdbSeriesArtworks')).toBe(true)
    expect(SINGLE_IP_SOURCES.has('animeMapping')).toBe(false)
  })

  test('el presupuesto global evita correr 30 conexiones del trial', () => {
    process.env.SCRAPER_MODE = 'backfill'
    const config = getSourceConfig('anilist')
    delete process.env.SCRAPER_MODE
    expect(config.maxWorkers).toBe(30)
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
