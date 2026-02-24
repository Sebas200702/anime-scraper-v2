import type { SourceConfig } from 'types/index.js'
export const SOURCES: SourceConfig[] = [
  {
    name: 'jikan',
    maxWorkers: 1,
    pageBatch: 40,
    rateLimit: { perSecond: 1, perMinute: 60 },
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
    maxWorkers: 80,
    pageBatch: 40,
    rateLimit: { perSecond: 1, perMinute: 40 },
    tasks: {
      anime_details_hydration: { entity: 'animeDetails' },
      anime_characters_hydration: { entity: 'animeCharacters' },
      anime_staff_hydration: { entity: 'animeStaff' },
    },
  },
  {
    name: 'animeThemes',
    maxWorkers: 60,
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
    maxWorkers: 60,
    pageBatch: 2000,
    rateLimit: { perSecond: 1, perMinute: 40 },
    tasks: {
      anime_mapping: { entity: 'animeMapping', needsPayload: true },
    },
  },
  {
    name: 'animeEpisodes',
    maxWorkers: 60,
    pageBatch: 80,
    rateLimit: { perSecond: 1, perMinute: 40 },
    tasks: {
      anime_episodes_hydration: { entity: 'animeEpisodes', extractPage: true },
    },
  },
  {
    name: 'tvdbSeriesArtworks',
    maxWorkers: 80,
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
