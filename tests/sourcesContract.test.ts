import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { SOURCES } from '../src/config/sources.js'

/**
 * Contrato entre los inicializadores y la config: cada `taskType` que un
 * inicializador escribe en la cola **tiene que existir** en los `tasks` de su
 * source; si no, el manager no sabe qué hacer con esa tarea.
 *
 * Lo encontró una corrida real: `animeMapping` creaba `anime_mapping_hydration`
 * mientras la config declaraba `anime_mapping` → `Unknown taskType` en todas.
 */
const INITIALIZERS: { source: string; file: string }[] = [
  { source: 'jikan', file: 'src/scripts/initializeTasks.ts' },
  {
    source: 'jikanRelations',
    file: 'src/scripts/initializeJikanRelationsTasks.ts',
  },
  { source: 'animeThemes', file: 'src/scripts/initializeAnimeThemesTasks.ts' },
  {
    source: 'animeMapping',
    file: 'src/scripts/initializeAnimeMappingTasks.ts',
  },
  {
    source: 'animeEpisodes',
    file: 'src/scripts/initializeAnimeEpisodesTasks.ts',
  },
  {
    source: 'tvdbSeriesArtworks',
    file: 'src/scripts/initializeTvdbSeriesArtworksTasks.ts',
  },
  { source: 'anilist', file: 'src/scripts/initializeAnilistTasks.ts' },
]

describe('contrato inicializador ↔ config de sources', () => {
  for (const { source, file } of INITIALIZERS) {
    test(`${source}: los taskType que crea existen en SOURCES`, () => {
      const code = readFileSync(file, 'utf-8')
      const used = [
        ...code.matchAll(/taskType:\s*'([^']+)'|taskType:\s*([A-Za-z.]+)/g),
      ]
        .map((match) => match[1] ?? '')
        .filter(Boolean)

      const config = SOURCES.find((entry) => entry.name === source)
      expect(config, `source ${source} no está en SOURCES`).toBeDefined()

      const declared = Object.keys(config?.tasks ?? {})
      const missing = used.filter((taskType) => !declared.includes(taskType))

      expect(missing, `taskType sin config en ${source}`).toEqual([])
      expect(declared.length).toBeGreaterThan(0)
    })
  }
})
