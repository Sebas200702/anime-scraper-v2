import type { SourceConfig } from 'types/index.js'

/**
 * Fase 0 — límites alineados con las cuotas reales de cada fuente.
 *
 * El rate limiter se crea **por worker** (`core/genericWorker.ts`), así que la
 * tasa efectiva es `maxWorkers × rateLimit`. Los valores de abajo son la única
 * combinación que respeta las cuotas documentadas; la Fase 1 mueve el límite a
 * un bucket global en el proceso padre y reemplaza esta aritmética.
 */
export const SOURCES: SourceConfig[] = [
  {
    name: 'jikan',
    maxWorkers: 1,
    pageBatch: 40,
    // 1 worker × 50/min = 50/min < 60/min reales de Jikan (headroom).
    rateLimit: { perSecond: 1, perMinute: 50 },
    deduplicateBy: 'mal_id',
    tasks: {
      anime_page_hydration: { entity: 'anime', extractPage: true },
      character_page_hydration: { entity: 'character', extractPage: true },
      staff_page_hydration: { entity: 'staff', extractPage: true },
      producer_page_hydration: { entity: 'producer', extractPage: true },
    },
  },
  {
    name: 'jikanRelations',
    // 2 workers × 1/s = 2/s y 2 × 28/min = 56/min < 3/s-60/min de Jikan.
    maxWorkers: 2,
    pageBatch: 40,
    rateLimit: { perSecond: 1, perMinute: 28 },
    tasks: {
      anime_details_hydration: { entity: 'animeDetails' },
      anime_characters_hydration: { entity: 'animeCharacters' },
      anime_staff_hydration: { entity: 'animeStaff' },
    },
  },
  {
    name: 'animeThemes',
    // JSON estático (CDN); 2 workers × 40/min = 80/min es prudente.
    maxWorkers: 2,
    pageBatch: 500,
    rateLimit: { perSecond: 1, perMinute: 40 },
    tasks: {
      anime_themes_hydration: {
        entity: 'animeThemes',
        useEntityIdDirectly: true,
        needsPayload: true,
      },
      artist_hydration: { entity: 'artist', useEntityIdDirectly: true },
    },
  },
  {
    name: 'animeMapping',
    // Busca en Kitsu (60/min) y TVDB: 1 worker; los limiters de módulo de
    // `services/animeMapping.ts` bajan a 1/s + 50/min por target.
    maxWorkers: 1,
    pageBatch: 2000,
    rateLimit: { perSecond: 1, perMinute: 40 },
    tasks: {
      anime_mapping: { entity: 'animeMapping', needsPayload: true },
    },
  },
  {
    name: 'animeEpisodes',
    // El limiter del worker gobierna inicios de tarea; el gate real por página
    // vive en `services/animeEpisodes.ts` (Kitsu 60/min).
    maxWorkers: 1,
    pageBatch: 80,
    rateLimit: { perSecond: 1, perMinute: 40 },
    tasks: {
      anime_episodes_hydration: { entity: 'animeEpisodes', extractPage: true },
    },
  },
  {
    name: 'tvdbSeriesArtworks',
    // Cuota por API key; además el token TVDB se cachea por worker.
    maxWorkers: 1,
    pageBatch: 100,
    rateLimit: { perSecond: 1, perMinute: 40 },
    tasks: {
      tvdb_series_artworks: {
        entity: 'tvdbSeriesArtworks',
        useEntityIdDirectly: true,
      },
    },
  },
]

export { capitalize } from '../shared/parsers.js'

export function getSourceConfig(sourceName: string) {
  const config = SOURCES.find((s) => s.name === sourceName)
  if (!config) throw new Error(`Unknown source: ${sourceName}`)
  return { ...config }
}
