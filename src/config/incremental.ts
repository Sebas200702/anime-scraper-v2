/**
 * Configuración del Modo B (actualizaciones incrementales en prod).
 *
 * El principio: **nunca se re-barre el catálogo**. Cada corrida:
 *   1. re-arma solo lo vencido por política (hot = airing/reciente),
 *   2. reclama un presupuesto acotado de tareas,
 *   3. sale. Lo que no entra queda para el siguiente tick.
 *
 * `hot` se ejecuta seguido (la novedad manda); `slow` pocas veces al día.
 * `jikan` no se drena: su listado es discovery (páginas nuevas).
 *
 * Jikan (`api.jikan.moe`) está caído (timeouts sostenidos, HTTP 000): se retira
 * `jikanRelations` del hot. Su cobertura la da MAL, ya presente: `mal` (API v2,
 * ficha/status/score/episodios) y `malHtml` (personajes). El staff queda en
 * `slow` vía `malPerson`. MAL es directo a bajo volumen (solo el delta hot), sin
 * depender del pool de proxies.
 */
export const INCREMENTAL_GROUPS: Record<'hot' | 'slow', string[]> = {
  hot: [
    'animeEpisodes', // capítulo recién emitido (Kitsu): la novedad manda
    'tvdbEpisodes', // miniaturas del capítulo
    'tmdb', // stills del capítulo
    'anilist', // banners/relaciones
    'mal', // canónica de la ficha: status, episodios, score, fechas, stats
    'malHtml', // personajes/seiyuus (90d)
  ],
  slow: [
    'animeThemes',
    'tvdbSeriesArtworks',
    'malManga',
    'malMangaPage',
    'malCharacters',
    'malPerson',
    'anilistMedia',
    'musicMeta',
    'ann',
    'malPeople',
    'malProducer',
    'animeMapping',
  ],
}

/** Fuentes que corren en una corrida `--drain --group=all`. */
export const ALL_DRAIN_SOURCES = [
  ...INCREMENTAL_GROUPS.hot,
  ...INCREMENTAL_GROUPS.slow,
]

/** Presupuesto por defecto por fuente (se puede pisar con `--budget`). */
export const DEFAULT_BUDGET_PER_SOURCE = Number(
  process.env.INCREMENTAL_BUDGET ?? 150
)

/** Tope de tareas en vuelo: prod es una sola IP, no hace falta fan-out. */
export const DEFAULT_MAX_IN_FLIGHT = Number(
  process.env.INCREMENTAL_MAX_IN_FLIGHT ?? 10
)

/** Deadline por defecto de una corrida (deja margen antes del próximo tick). */
export const DEFAULT_DEADLINE_SECONDS = Number(
  process.env.INCREMENTAL_DEADLINE_SECONDS ?? 600
)

/**
 * Cuántos días después de `aired_to` un anime sigue siendo "hot". Es la
 * ventana que garantiza la pasada final (estado, último capítulo) cuando la
 * temporada termina.
 */
export const CLOSING_WINDOW_DAYS = 7
