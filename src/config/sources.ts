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
    maxWorkers: 20,
    pageBatch: 200,
    rateLimit: { perSecond: 1, perMinute: 25 },
    tasks: {
      anime_banner_hydration: { entity: 'animeBanners', needsPayload: true },
      // Backfill en bulk: 1 tarea por año, la fuente pagina (50/request).
      anilist_year_hydration: { entity: 'anilistCatalog', needsPayload: true },
    },
  },
  {
    name: 'mal',
    // MAL API oficial v2: su throttle es **por IP**, así que va por proxies
    // (verificado: en directo se satura y por proxy responde en <1s).
    // `pageBatch`/`taskBatchSize` chicos: un lote grande de tareas que hacen
    // timeout deja miles de filas con lease vivo (se vio con 10k colgadas).
    maxWorkers: 8,
    pageBatch: 50,
    taskBatchSize: 200,
    rateLimit: { perSecond: 1, perMinute: 60 },
    tasks: {
      anime_mal_details_hydration: {
        entity: 'animeMalDetails',
        needsPayload: true,
      },
      // Bulk: 1 tarea por tipo de ranking, la fuente pagina (500/request).
      anime_mal_ranking_hydration: {
        entity: 'malRanking',
        needsPayload: true,
      },
    },
  },
  {
    name: 'malManga',
    // Ficha completa de las obras impresas (manga, novela, one-shot) en la API
    // v2 de MAL: sinopsis, capítulos, serialización, editorial y relaciones.
    maxWorkers: 100,
    pageBatch: 50,
    taskBatchSize: 200,
    rateLimit: { perSecond: 1, perMinute: 60 },
    tasks: {
      manga_mal_details_hydration: { entity: 'malManga', needsPayload: true },
    },
  },
  {
    name: 'malCharacters',
    // Reparto **completo** por anime. La ficha HTML de MAL solo lista los
    // primeros 10 personajes; `/v2/anime/{id}/characters` devuelve la lista
    // entera paginada (hasta 100 por página).
    maxWorkers: 30,
    pageBatch: 50,
    taskBatchSize: 200,
    rateLimit: { perSecond: 1, perMinute: 60 },
    tasks: {
      anime_mal_characters_hydration: {
        entity: 'malCharacters',
        needsPayload: true,
      },
    },
  },
  {
    name: 'malPerson',
    // Ficha de persona de la API v2 (`/v2/people/{id}`): sirve para el staff
    // **y** para los personajes (en MAL ambos son personas) y trae nombre,
    // biografía, alias y retrato.
    maxWorkers: 100,
    pageBatch: 50,
    taskBatchSize: 200,
    rateLimit: { perSecond: 1, perMinute: 60 },
    tasks: {
      person_mal_details_hydration: { entity: 'malPerson', needsPayload: true },
    },
  },
  {
    name: 'anilistMedia',
    // Pase profundo por medio: reparto completo con voz, créditos de staff,
    // relaciones y enlaces externos. AniList es la única fuente que da el
    // reparto entero de las series largas.
    maxWorkers: 100,
    pageBatch: 50,
    taskBatchSize: 200,
    rateLimit: { perSecond: 1, perMinute: 25 },
    tasks: {
      media_anilist_details_hydration: {
        entity: 'anilistMedia',
        needsPayload: true,
      },
    },
  },
  {
    name: 'musicMeta',
    // Metadatos de las canciones en las tiendas: Spotify (oEmbed, sin
    // credenciales) da el título exacto y la carátura; iTunes (lookup) da
    // álbum, duración y fecha.
    maxWorkers: 30,
    pageBatch: 50,
    taskBatchSize: 200,
    rateLimit: { perSecond: 1, perMinute: 60 },
    tasks: {
      music_meta_hydration: { entity: 'musicMeta', needsPayload: true },
    },
  },
  {
    name: 'tmdb',
    // Backdrops (banner) y stills (miniatura de episodio con `episode_number`).
    // Requiere TMDB_API_KEY; sin key no se siembra nada.
    maxWorkers: 20,
    pageBatch: 50,
    taskBatchSize: 200,
    rateLimit: { perSecond: 10, perMinute: 600 },
    tasks: {
      tmdb_images_hydration: { entity: 'tmdbImages', needsPayload: true },
    },
  },
  {
    name: 'tvdbEpisodes',
    // Imágenes de cada episodio: TVDB las publica y Kitsu no. El mapeo a
    // nuestra numeración se verifica (recuento + fecha + título).
    maxWorkers: 10,
    pageBatch: 50,
    taskBatchSize: 200,
    rateLimit: { perSecond: 2, perMinute: 120 },
    tasks: {
      tvdb_episodes_hydration: { entity: 'tvdbEpisodes', needsPayload: true },
    },
  },
  {
    name: 'ann',
    // Enciclopedia de Anime News Network: OP/ED con nº de tema, artista y rango
    // de episodios (dato que ni MAL ni AnimeThemes dan completos). El id de
    // ANN llega del dump offline, así que el emparejamiento es exacto.
    maxWorkers: 20,
    pageBatch: 50,
    taskBatchSize: 200,
    rateLimit: { perSecond: 1, perMinute: 40 },
    tasks: {
      ann_themes_hydration: { entity: 'annThemes', needsPayload: true },
    },
  },
  {
    name: 'malPeople',
    // Fichas de persona (HTML): solo para las que no tienen retrato.
    maxWorkers: 8,
    pageBatch: 50,
    taskBatchSize: 200,
    rateLimit: { perSecond: 1, perMinute: 60 },
    tasks: {
      staff_image_hydration: { entity: 'malPeople', needsPayload: true },
    },
  },
  {
    name: 'malHtml',
    // Web de MAL (HTML): ~35-48 KB gzip por ficha, ~1.1 GB para todo el
    // catálogo (cabe en el trial). Su throttle es por IP y agresivo.
    maxWorkers: 8,
    pageBatch: 50,
    taskBatchSize: 200,
    rateLimit: { perSecond: 1, perMinute: 60 },
    tasks: {
      anime_mal_html_hydration: {
        entity: 'malCharacters',
        needsPayload: true,
      },
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
    maxWorkers: 10,
    // La clave aguanta ~16 req/s (medido: 60 búsquedas en 3,7 s sin un 429),
    // así que el tope conservative de 40/min dejaba los 3.000 artworks nuevos
    // en 75 min.
    rateLimit: { perSecond: 2, perMinute: 120 },
  },
  anilist: { maxWorkers: 30, rateLimit: { perSecond: 1, perMinute: 25 } },
  // 20 en vuelo: la cuota de MAL es por IP y hay 30 proxies.
  mal: { maxWorkers: 20, rateLimit: { perSecond: 2, perMinute: 120 } },
  // 30 en vuelo: el presupuesto de conexiones por fuente es 30 y la
  // latencia (no el ancho de banda) es lo que manda en estas fichas.
  malHtml: { maxWorkers: 30, rateLimit: { perSecond: 1, perMinute: 40 } },
  malPeople: { maxWorkers: 20, rateLimit: { perSecond: 1, perMinute: 40 } },
  // Las fichas de MAL son pequeñas (~1 KB): 30 en vuelo por 100 IPs.
  malManga: { maxWorkers: 100, rateLimit: { perSecond: 2, perMinute: 120 } },
  malCharacters: {
    maxWorkers: 30,
    rateLimit: { perSecond: 2, perMinute: 120 },
  },
  malPerson: { maxWorkers: 100, rateLimit: { perSecond: 2, perMinute: 120 } },
  anilistMedia: { maxWorkers: 100, rateLimit: { perSecond: 1, perMinute: 25 } },
  musicMeta: { maxWorkers: 60, rateLimit: { perSecond: 2, perMinute: 120 } },
  ann: { maxWorkers: 20, rateLimit: { perSecond: 1, perMinute: 40 } },
  tvdbEpisodes: { maxWorkers: 10, rateLimit: { perSecond: 2, perMinute: 120 } },
  tmdb: { maxWorkers: 10, rateLimit: { perSecond: 2, perMinute: 120 } },
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
  anilist_year_hydration: 30 * 86400,
  anime_mal_details_hydration: 30 * 86400,
  anime_mal_ranking_hydration: 7 * 86400,
  anime_mal_html_hydration: 90 * 86400,
  staff_image_hydration: 180 * 86400,
}

/**
 * Prioridad de media por fuente (menor = se prefiere al elegir una variante del
 * mismo `media_type`). AniList es la fuente **primaria** de banners.
 */
export const MEDIA_SOURCE_PRIORITY: Record<string, number> = {
  anilist: 10,
  kitsu: 15,
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
    limits: { perSecond: 3, perMinute: 150 },
  },
  anilist: {
    host: 'graphql.anilist.co',
    limits: { perSecond: 1, perMinute: 25 },
  },
  mal: {
    host: 'api.myanimelist.net',
    limits: { perSecond: 2, perMinute: 120 },
  },
  malHtml: {
    host: 'myanimelist.net',
    limits: { perSecond: 1, perMinute: 40 },
  },
  ann: {
    host: 'www.animenewsnetwork.com',
    limits: { perSecond: 1, perMinute: 40 },
  },
  tvdbEpisodes: {
    host: 'api4.thetvdb.com',
    limits: { perSecond: 3, perMinute: 150 },
  },
  tmdb: {
    // TMDB aguanta ~40 req/s con la key; con 10/s las 7.100 series (3
    // peticiones cada una) entran en ~40 min.
    host: 'api.themoviedb.org',
    limits: { perSecond: 10, perMinute: 600 },
  },
  malPeople: {
    host: 'myanimelist.net',
    limits: { perSecond: 1, perMinute: 40 },
  },
  malManga: {
    host: 'api.myanimelist.net',
    limits: { perSecond: 2, perMinute: 120 },
  },
  malCharacters: {
    host: 'api.myanimelist.net',
    limits: { perSecond: 2, perMinute: 120 },
  },
  malPerson: {
    host: 'api.myanimelist.net',
    limits: { perSecond: 2, perMinute: 120 },
  },
  anilistMedia: {
    host: 'graphql.anilist.co',
    limits: { perSecond: 1, perMinute: 25 },
  },
  musicMeta: {
    host: 'open.spotify.com',
    limits: { perSecond: 2, perMinute: 120 },
  },
}

/**
 * Fuentes que NO se reparten entre proxies. TVDB no va aquí: su token es de una
 * API key y repartir entre IPs no multiplica cuota, pero **tampoco la rompe**
 * (la cuota es por key, no por IP) y con 1 en vuelo era el cuello del backfill
 * (6k+ series × ~2 llamadas a 40/min = horas). Se paraleliza con el cupo normal
 * y el `RateGate` conserva el límite por host.
 */
/**
 * Fuentes que van **directo** (sin proxy) porque su cuota es **por credencial**
 * (API key), no por IP: TVDB. Repartirla entre proxies no multiplica nada.
 *
 * MAL **no** va aquí: su throttle es por IP (verificado: se satura en directo y
 * responde bien por proxy), así que se reparte entre IPs como Kitsu/AniList.
 */
export const SINGLE_IP_SOURCES = new Set([
  'tvdbSeriesArtworks',
  // TMDB: la cuota es de la API key, no de la IP, y los proxies no llegan a
  // api.themoviedb.org (fallan con error de red). Va directo.
  'tmdb',
])

/**
 * Hosts cuya cuota es **por API key**: el gate los trata como una sola clave
 * global (ignora la IP de salida). Paralelizar entre proxies no multiplica la
 * cuota y sí la rompería; el límite real es del host, no de la IP.
 */
/**
 * Hosts cuya cuota es por **credencial**, no por IP: el gate se cuenta global.
 *
 * `api.myanimelist.net` **no** va aquí: medido con el mismo client-id, 60
 * requests concurrentes repartidos por 30 IPs dieron 0 respuestas 429 (su
 * límite es por IP). Contarlo como global limitaba la fuente a 2 req/s
 * (30.561 fichas = 4,2 h) cuando con los proxies da ~20 req/s (~25 min).
 */
export const KEY_SCOPED_HOSTS = new Set([
  'api4.thetvdb.com',
  // La cuota de TMDB es de la API key: el gate la cuenta como una sola clave.
  'api.themoviedb.org',
])

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
