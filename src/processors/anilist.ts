import type {
  AnimeBannersProcessorResult,
  AnimeCatalogProcessorResult,
  AnimePatch,
  NewAnimeRelatedAnime,
  NewMedia,
} from '../types/index.js'
import type { AniListBannerResponse, FuzzyDate } from 'types/anilistApi.js'
import type { AniListMedia } from '../services/anilist.js'
import type { ScrapingTask } from '../types/index.js'

/** AniList → vocabulario de `anime.source` (el de Jikan, para un diff limpio). */
const SOURCE_MAP: Record<string, string> = {
  ORIGINAL: 'Original',
  MANGA: 'Manga',
  LIGHT_NOVEL: 'Light novel',
  VISUAL_NOVEL: 'Visual novel',
  NOVEL: 'Novel',
  GAME: 'Game',
  DOUJINSHI: 'Doujinshi',
  ANIME: 'Anime',
  OTHER: 'Other',
}

/**
 * AniList → `relation_type` de Jikan (el processor de jikanRelations escribe
 * los strings de Jikan tal cual). Solo relations entre anime; el resto
 * (manga fuente, personajes) no cabe en `anime_relation`.
 */
const RELATION_MAP: Record<string, string> = {
  SEQUEL: 'Sequel',
  PREQUEL: 'Prequel',
  PARENT: 'Parent story',
  SIDE_STORY: 'Side story',
  CHARACTER: 'Character',
  SUMMARY: 'Summary',
  ALTERNATIVE: 'Alternative setting',
  SPIN_OFF: 'Spin-off',
  ADAPTATION: 'Adaptation',
  COMPILATION: 'Summary',
  CONTAINS: 'Other',
  OTHER: 'Other',
  SOURCE: 'Other',
}

const WEEKDAYS = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
]

const toIsoDate = (d: FuzzyDate | null | undefined): string | undefined => {
  if (!d?.year) return undefined
  const m = String(d.month ?? 1).padStart(2, '0')
  const day = String(d.day ?? 1).padStart(2, '0')
  return `${d.year}-${m}-${day}`
}

/** AniList devuelve HTML (`<br>`, `<i>`…): la sinopsis se guarda en plano. */
const stripHtml = (html: string): string | undefined => {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .split('\n')
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .filter(Boolean)
    .join('\n')
  return text.length > 0 ? text : undefined
}

/**
 * Día/hora de emisión estilo Jikan desde el próximo episodio. `airingAt` es
 * unix en UTC del horario JST: se convierte a Asia/Tokyo antes de partir.
 */
const broadcastFromAiringAt = (
  airingAt: number | null | undefined
): Pick<
  AnimePatch,
  'broadcastDay' | 'broadcastTime' | 'broadcastTimezone'
> | null => {
  if (!airingAt) return null
  const jst = new Date((airingAt + 9 * 3600) * 1000)
  const day = WEEKDAYS[jst.getUTCDay()]
  if (!day) return null
  return {
    broadcastDay: day,
    broadcastTime: `${String(jst.getUTCHours()).padStart(2, '0')}:${String(
      jst.getUTCMinutes()
    ).padStart(2, '0')}`,
    broadcastTimezone: 'Asia/Tokyo',
  }
}

/**
 * Mapea el Media de AniList a `anime_media` (banner + poster), un parche
 * disperso de `anime` (tráiler, origen, fechas, sinopsis, broadcast) y las
 * relations tipadas. Todo sale de **1 request** (misma task de banners).
 */
export const processAnimeBanners = (
  rawData: AniListBannerResponse,
  task: ScrapingTask
): AnimeBannersProcessorResult => {
  const { animeId } = task.payload as { animeId?: number }
  const media = rawData.data?.Media
  if (!animeId || !media) return { animeMedias: [] }

  const animeMedias: NewMedia[] = []
  if (media.bannerImage) {
    animeMedias.push({
      entityType: 'anime',
      entityId: animeId,
      // El vocabulario es el de anidev (`MediaType`), en minúsculas.
      mediaType: 'banner',
      src: media.bannerImage,
      size: null,
    })
  }
  const poster = media.coverImage?.extraLarge ?? media.coverImage?.large
  if (poster) {
    animeMedias.push({
      entityType: 'anime',
      entityId: animeId,
      mediaType: 'poster',
      src: poster,
      size: null,
    })
  }

  // Parche disperso: solo lo que AniList conoce (lo ausente se omite, el repo
  // solo actualiza las claves presentes y jamás escribe nulls).
  const patch: AnimePatch = { malId: animeId }
  if (media.trailer?.site === 'youtube' && media.trailer.id) {
    patch.trailerYoutubeId = media.trailer.id
    patch.trailerEmbedUrl = `https://www.youtube.com/embed/${media.trailer.id}`
  }
  const source = media.source && SOURCE_MAP[media.source]
  if (source) patch.source = source
  const airedFrom = toIsoDate(media.startDate)
  if (airedFrom) patch.airedFrom = airedFrom
  const airedTo = toIsoDate(media.endDate)
  if (airedTo) patch.airedTo = airedTo
  if (media.description) {
    const synopsis = stripHtml(media.description)
    if (synopsis) patch.synopsis = synopsis
  }
  const broadcast = broadcastFromAiringAt(media.nextAiringEpisode?.airingAt)
  if (broadcast) Object.assign(patch, broadcast)

  // Relations: solo anime→anime con idMal (la junction exige FK a `anime` en
  // ambos lados; el manga fuente y rarezas sin idMal se descartan aquí y lo
  // que falte en `anime` lo filtra el repo por FK existente).
  const animeRelations: NewAnimeRelatedAnime[] = []
  for (const edge of media.relations?.edges ?? []) {
    const node = edge?.node
    const relationType =
      (edge?.relationType && RELATION_MAP[edge.relationType]) ?? null
    if (node?.type !== 'ANIME' || !node.idMal || !relationType) continue
    if (node.idMal === animeId) continue
    animeRelations.push({
      animeId,
      relationType,
      relatedAnimeId: node.idMal,
    })
  }

  return {
    animeMedias,
    ...(Object.keys(patch).length > 1 ? { animePatch: patch } : {}),
    ...(animeRelations.length > 0 ? { animeRelations } : {}),
  }
}

/**
 * Procesa una página de catálogo (`fetchAniListCatalogYear`, 50 anime) reusando
 * el mapeo por-anime: cada media se trata como si fuera su propia tarea
 * (`animeId = idMal`), así el backfill en bulk y el refresh por-anime comparten
 * exactamente la misma semántica.
 */
export const processAniListCatalog = (
  raw: { media?: AniListMedia[] },
  _task: ScrapingTask
): AnimeCatalogProcessorResult => {
  const results: AnimeBannersProcessorResult[] = []
  for (const media of raw.media ?? []) {
    if (!media?.idMal) continue
    results.push(
      processAnimeBanners({ data: { Media: media } }, {
        payload: { animeId: media.idMal },
      } as ScrapingTask)
    )
  }
  return { results }
}
