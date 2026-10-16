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

  test('TVDB es cuota por API key (KEY_SCOPED), no por IP', () => {
    // Paralelizar entre IPs no multiplica la cuota de una API key y sí la
    // rompería: el gate la trata como una sola clave global.
    expect(KEY_SCOPED_HOSTS.has('api4.thetvdb.com')).toBe(true)
    expect(SINGLE_IP_SOURCES.size).toBe(0)
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
