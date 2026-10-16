import type { SourceConfig } from 'types/index.js'

/**
 * Configuración de fuentes.
 *
 * La cuota efectiva ya **no** se calcula por worker: el `RateGate` la aplica
 * por `(host, IP de salida)` con los límites de `SOURCE_HOSTS` (una IP por
 * tarea, ver `core/taskDispatcher.ts`). `rateLimit` queda como presupuesto por
 * defecto de la fuente (fallback si la fuente no tiene host declarado).
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
      anime_mapping_hydration: { entity: 'animeMapping', needsPayload: true },
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
  {
    name: 'anilist',
    // Cuota real de AniList: 30 req/min por IP (x-ratelimit-limit), con headroom.
    // Es la fuente PRIMARIA de banners (priority 10 en MEDIA_SOURCE_PRIORITY).
    maxWorkers: 8,
    pageBatch: 200,
    rateLimit: { perSecond: 1, perMinute: 25 },
    tasks: {
      anime_banner_hydration: { entity: 'animeBanners', needsPayload: true },
    },
  },
]

export { capitalize } from '../shared/parsers.js'

/**
 * Modo A (backfill, entorno aislado): un proxy por worker, así que la tasa
 * efectiva se multiplica por IP y cada worker puede usar su cuota completa.
 * Modo B (prod) mantiene los valores conservadores de la Fase 0.
 *
 * Se activa con `SCRAPER_MODE=backfill` y `SCRAPER_MAX_WORKERS` lo acota.
 */
const BACKFILL_PROFILES: Record<
  string,
  { maxWorkers: number; rateLimit: { perSecond: number; perMinute: number } }
> = {
  jikan: { maxWorkers: 30, rateLimit: { perSecond: 1, perMinute: 40 } },
  jikanRelations: {
    maxWorkers: 30,
    rateLimit: { perSecond: 1, perMinute: 40 },
  },
  animeThemes: { maxWorkers: 30, rateLimit: { perSecond: 1, perMinute: 60 } },
  animeMapping: { maxWorkers: 30, rateLimit: { perSecond: 1, perMinute: 50 } },
  animeEpisodes: { maxWorkers: 30, rateLimit: { perSecond: 1, perMinute: 50 } },
  tvdbSeriesArtworks: {
    maxWorkers: 5,
    rateLimit: { perSecond: 1, perMinute: 40 },
  },
  anilist: { maxWorkers: 30, rateLimit: { perSecond: 1, perMinute: 25 } },
}

/**
 * Cadencia de refresh por defecto (segundos) cuando `ingest.task_policy` no
 * tiene entrada para ese taskType. Es la "memoria del barrido rodante" del plan
 * de fill/refresh: airing semanal, catálogo estable cada meses.
 */
export const DEFAULT_REFRESH_SECONDS: Record<string, number> = {
  anime_page_hydration: 24 * 3600,
  character_page_hydration: 90 * 86400,
  staff_page_hydration: 90 * 86400,
  producer_page_hydration: 90 * 86400,
  anime_details_hydration: 7 * 86400,
  anime_characters_hydration: 180 * 86400,
  anime_staff_hydration: 180 * 86400,
  anime_themes_hydration: 30 * 86400,
  artist_hydration: 90 * 86400,
  anime_mapping_hydration: 180 * 86400,
  anime_episodes_hydration: 7 * 86400,
  tvdb_series_artworks: 180 * 86400,
  anime_banner_hydration: 180 * 86400,
}

/**
 * Prioridad de media por fuente (menor = se prefiere al elegir una variante del
 * mismo `media_type`). AniList es la fuente **primaria** de banners.
 */
export const MEDIA_SOURCE_PRIORITY: Record<string, number> = {
  anilist: 10,
  jikan: 20,
  mal: 25,
  tvdb: 30,
  animethemes: 40,
}

const MAX_WORKERS_ENV = () => Number(process.env.SCRAPER_MAX_WORKERS)

/**
 * Host y cuota por IP de cada fuente. La cuota la aplica el `RateGate` por
 * (host, IP de salida), porque Jikan/Kitsu la imponen por IP.
 */
export const SOURCE_HOSTS: Record<
  string,
  { host: string; limits: { perSecond: number; perMinute: number } }
> = {
  jikan: { host: 'api.jikan.moe', limits: { perSecond: 3, perMinute: 60 } },
  jikanRelations: {
    host: 'api.jikan.moe',
    limits: { perSecond: 3, perMinute: 60 },
  },
  animeThemes: {
    host: 'animethemes.moe',
    limits: { perSecond: 2, perMinute: 120 },
  },
  animeMapping: { host: 'kitsu.io', limits: { perSecond: 1, perMinute: 60 } },
  animeEpisodes: { host: 'kitsu.io', limits: { perSecond: 1, perMinute: 60 } },
  tvdbSeriesArtworks: {
    host: 'api4.thetvdb.com',
    limits: { perSecond: 1, perMinute: 30 },
  },
  anilist: {
    host: 'graphql.anilist.co',
    limits: { perSecond: 1, perMinute: 25 },
  },
}

/**
 * Fuentes cuya cuota es **por API key**, no por IP: repartirlas entre proxies
 * no multiplica nada y además arriesga la key, así que van en una sola IP.
 */
export const SINGLE_IP_SOURCES = new Set(['tvdbSeriesArtworks'])

export function getSourceConfig(sourceName: string) {
  const config = SOURCES.find((s) => s.name === sourceName)
  if (!config) throw new Error(`Unknown source: ${sourceName}`)

  const resolved = { ...config }
  const profile = BACKFILL_PROFILES[resolved.name]

  if (profile && process.env.SCRAPER_MODE === 'backfill') {
    // Se lee en el momento (no al importar): así el modo también funciona si el
    // entorno se define después de cargar el módulo.
    const requested = MAX_WORKERS_ENV()
    const cap =
      Number.isInteger(requested) && requested > 0
        ? requested
        : profile.maxWorkers

    resolved.maxWorkers = Math.min(cap, profile.maxWorkers)
    resolved.rateLimit = { ...profile.rateLimit }
    console.log(
      `⚙️  Modo backfill: ${resolved.name} con ${resolved.maxWorkers} tareas en vuelo (una IP por tarea)`
    )
  }

  return resolved
}
