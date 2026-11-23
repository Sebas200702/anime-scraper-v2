import { describe, expect, test } from 'bun:test'
import { isRetiredSource } from '../src/config/incremental.js'
import {
  REFRESH_POLICY,
  SINGLE_IP_SOURCES,
  SOURCES,
  SOURCE_HOSTS,
} from '../src/config/sources.js'
import {
  DERIVED_SOURCES,
  INITIALIZERS,
  LISTING_SOURCES,
} from '../src/scripts/initializers.js'
import { runDiscovery } from '../src/scripts/discovery.js'
import { discoveryWarnings } from '../src/shared/discoveryWarnings.js'
import { emptySummary } from '../src/scripts/runSummary.js'

describe('S2/S3 · malDiscovery como fuente de listado', () => {
  test('LISTING_SOURCES = [malDiscovery], activa y fuera de los derivados', () => {
    expect(LISTING_SOURCES).toEqual(['malDiscovery'])
    expect(isRetiredSource('malDiscovery')).toBe(false)
    expect(DERIVED_SOURCES).not.toContain('malDiscovery')
    expect(DERIVED_SOURCES).toContain('mal')
    expect(typeof INITIALIZERS.malDiscovery).toBe('function')
  })

  test('mismo host, cuota y ruteo de IP que mal; refresco 20 h (el discover diario las encuentra vencidas)', () => {
    expect(SOURCE_HOSTS.malDiscovery).toEqual(SOURCE_HOSTS.mal!)
    expect(SINGLE_IP_SOURCES.has('malDiscovery')).toBe(
      SINGLE_IP_SOURCES.has('mal')
    )
    const config = SOURCES.find((s) => s.name === 'malDiscovery')
    const types = Object.keys(config?.tasks ?? {})
    expect(types).toEqual([
      'anime_mal_discovery_season_hydration',
      'anime_mal_discovery_ranking_hydration',
    ])
    for (const type of types)
      expect(REFRESH_POLICY[type]).toEqual({
        cold: 20 * 3600,
        hot: 20 * 3600,
      })
  })
})

const fakeDeps = (malClientId: string | undefined) => {
  const calls: string[] = []
  const lines: string[] = []
  const initializers = Object.fromEntries(
    ['malDiscovery', 'mal', 'anilist'].map((source) => [
      source,
      async () => {
        calls.push(`seed:${source}`)
      },
    ])
  )
  return {
    calls,
    lines,
    deps: {
      listing: ['malDiscovery'],
      derived: ['mal', 'anilist'],
      initializers,
      drain: async (sources: string[]) => {
        calls.push(`drain:${sources.join(',')}`)
        return emptySummary()
      },
      rearmHot: async () => {
        calls.push('rearmHot')
        return { rearmed: 0, payloads: 0, seeded: 0 }
      },
      requeue: async () => {
        calls.push('requeue')
        return 0
      },
      malClientId,
      log: (line: string) => lines.push(line),
      warn: (line: string) => lines.push(`WARN ${line}`),
    },
  }
}

describe('S3/S4 · orden del discover y aviso de MAL_CLIENT_ID', () => {
  test('siembra y drena malDiscovery antes de los inicializadores derivados', async () => {
    const { calls, deps } = fakeDeps('client')
    const result = await runDiscovery(deps)
    expect(calls).toEqual([
      'seed:malDiscovery',
      'drain:malDiscovery',
      'seed:mal',
      'seed:anilist',
      'rearmHot',
      'requeue',
    ])
    expect(result.warnings).toEqual([])
  })

  test('sin MAL_CLIENT_ID imprime un aviso explícito y lo devuelve', async () => {
    const { lines, deps, calls } = fakeDeps(undefined)
    const result = await runDiscovery(deps)
    expect(result.warnings).toEqual(['missing:MAL_CLIENT_ID'])
    const warning = lines.find((l) => l.startsWith('WARN '))
    expect(warning).toContain('MAL_CLIENT_ID')
    expect(warning).toContain('malDiscovery')
    // La semántica `skipped` se mantiene: las tareas se siembran y drenan igual.
    expect(calls).toContain('drain:malDiscovery')
  })

  test('discoveryWarnings: vacío con client id, código + mensaje sin él', () => {
    expect(discoveryWarnings('abc')).toEqual([])
    expect(discoveryWarnings('')).toHaveLength(1)
    const [warning] = discoveryWarnings(undefined)
    expect(warning?.code).toBe('missing:MAL_CLIENT_ID')
    expect(warning?.message).toContain('skipped')
  })
})
