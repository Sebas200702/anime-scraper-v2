import type {
  AnimeMalDetailsProcessorResult,
  ScrapingTask,
} from '../types/index.js'
import type { MalAnimeDetails } from 'types/malApi.js'

/** MAL `media_type` → vocabulario Jikan/anidev. */
const TYPE_MAP: Record<string, string> = {
  tv: 'TV',
  movie: 'Movie',
  ova: 'OVA',
  ona: 'ONA',
  special: 'Special',
  music: 'Music',
  tv_special: 'Special',
}

/** MAL `status` → vocabulario Jikan. */
const STATUS_MAP: Record<string, string> = {
  finished_airing: 'Finished Airing',
  currently_airing: 'Currently Airing',
  not_yet_aired: 'Not yet aired',
}

/** MAL `source` → vocabulario Jikan. */
const SOURCE_MAP: Record<string, string> = {
  original: 'Original',
  manga: 'Manga',
  light_novel: 'Light novel',
  visual_novel: 'Visual novel',
  novel: 'Novel',
  game: 'Game',
  doujinshi: 'Doujinshi',
  anime: 'Anime',
  web_manga: 'Web manga',
  music: 'Music',
  picture_book: 'Picture book',
  book: 'Book',
  radio: 'Radio',
  card_game: 'Card game',
  other: 'Other',
  unknown: 'Unknown',
}

/** MAL `rating` → vocabulario Jikan. */
const RATING_MAP: Record<string, string> = {
  g: 'G - All Ages',
  pg: 'PG - Children',
  pg_13: 'PG-13 - Teens 13 or older',
  r: 'R - 17+ (violence & profanity)',
  r_plus: 'R+ - Mild Nudity',
  rx: 'Rx - Hentai',
}

const WEEKDAYS: Record<string, string> = {
  monday: 'Mondays',
  tuesday: 'Tuesdays',
  wednesday: 'Wednesdays',
  thursday: 'Thursdays',
  friday: 'Fridays',
  saturday: 'Saturdays',
  sunday: 'Sundays',
}

/** Duración: MAL da segundos por episodio; Jikan da texto "24 min per ep". */
const durationText = (seconds?: number): string | undefined => {
  if (!seconds || seconds <= 0) return undefined
  return `${Math.round(seconds / 60)} min per ep`
}

/**
 * Mapea el payload de MAL API v2 a: stats/descriptivos de `anime` + las
 * junctions de taxonomía y compañías con **ids MAL nativos**. `studios` son
 * animación (`role: 'studio'`); el resto de compañías van como `producer`
 * (los licenciadores reales solo los da el detalle de la compañía).
 */
/**
 * MAL devuelve géneros, temas y demográficas juntos en `genres`. Las cuatro
 * demográficas tienen ids estables (25 Shoujo, 26 Josei, 27 Shounen, 28 Seinen)
 * y se separan a `demographic`; el resto (incluidos los temas) va a `genre`
 * **sin perder nada**: comparten ids MAL, así que un split posterior es un
 * `UPDATE`, no un refetch.
 */
const DEMOGRAPHIC_IDS = new Set([25, 26, 27, 28])

export const processAnimeMalDetails = (
  raw: MalAnimeDetails,
  task: ScrapingTask
): AnimeMalDetailsProcessorResult => {
  const malId = Number(task.entityId.replace('anime_mal_', ''))
  const allGenres = (raw.genres ?? []).map((g) => ({
    malId: g.id,
    name: g.name,
  }))
  const genres = allGenres.filter((g) => !DEMOGRAPHIC_IDS.has(g.malId))
  const demographics = allGenres.filter((g) => DEMOGRAPHIC_IDS.has(g.malId))
  const themes = (raw.themes ?? []).map((g) => ({ malId: g.id, name: g.name }))
  const studios = (raw.studios ?? []).map((s) => ({
    malId: s.id,
    role: 'studio' as const,
  }))

  const day = raw.broadcast?.day_of_the_week
  const animeStats: NonNullable<AnimeMalDetailsProcessorResult['animeStats']> =
    {
      malId,
      titleEnglish: raw.alternative_titles?.en ?? undefined,
      titleJapanese: raw.alternative_titles?.ja ?? undefined,
      type: raw.media_type ? TYPE_MAP[raw.media_type] : undefined,
      status: raw.status ? STATUS_MAP[raw.status] : undefined,
      episodes: raw.num_episodes || undefined,
      score: raw.mean ?? undefined,
      scoredBy: raw.num_scoring_users ?? undefined,
      popularityRank: raw.popularity ?? undefined,
      rating: raw.rating ? RATING_MAP[raw.rating] : undefined,
      year: raw.start_season?.year ?? undefined,
      season: raw.start_season?.season?.toLowerCase() ?? undefined,
      synopsis: raw.synopsis ?? undefined,
      background: raw.background ?? undefined,
      airedFrom: raw.start_date ?? undefined,
      airedTo: raw.end_date ?? undefined,
      duration: durationText(raw.average_episode_duration),
      source: raw.source ? SOURCE_MAP[raw.source] : undefined,
      rank: raw.rank ?? undefined,
      members: raw.num_list_users ?? undefined,
      broadcastDay: day ? WEEKDAYS[day] : undefined,
      broadcastTime: raw.broadcast?.start_time ?? undefined,
      broadcastTimezone: day ? 'Asia/Tokyo' : undefined,
    }

  const animeProducers = studios.map((s) => ({
    animeId: malId,
    producerId: s.malId,
    role: s.role,
  }))

  return {
    animeStats,
    genres,
    demographics,
    themes,
    producers: studios.map((s) => ({ malId: s.malId })),
    animeGenres: genres.map((g) => ({ animeId: malId, genreId: g.malId })),
    animeDemographics: demographics.map((d) => ({
      animeId: malId,
      demographicId: d.malId,
    })),
    animeThemes: themes.map((t) => ({ animeId: malId, themeId: t.malId })),
    animeProducers,
  }
}

/**
 * Procesa una página/tipo de ranking de MAL (500 anime por request) reusando el
 * mapeo por-anime: cada node se trata como su propia unidad (`anime_mal_{id}`),
 * así el bulk y el detalle comparten exactamente la misma semántica.
 */
export const processMalRanking = (
  raw: { nodes?: MalAnimeDetails[] },
  _task: ScrapingTask
): { results: AnimeMalDetailsProcessorResult[] } => {
  const results: AnimeMalDetailsProcessorResult[] = []
  for (const node of raw.nodes ?? []) {
    if (!node?.id) continue
    results.push(
      processAnimeMalDetails(node, {
        entityId: `anime_mal_${node.id}`,
      } as ScrapingTask)
    )
  }
  return { results }
}
