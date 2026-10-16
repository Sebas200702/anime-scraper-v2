import type {
  AnimeBannersProcessorResult,
  AnimePatch,
  NewMedia,
} from '../types/index.js'
import type { AniListBannerResponse, FuzzyDate } from 'types/anilistApi.js'
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

const toIsoDate = (d: FuzzyDate | null | undefined): string | undefined => {
  if (!d?.year) return undefined
  const m = String(d.month ?? 1).padStart(2, '0')
  const day = String(d.day ?? 1).padStart(2, '0')
  return `${d.year}-${m}-${day}`
}

/**
 * Mapea el Media de AniList a `anime_media` (banner + poster) y a un parche
 * disperso de `anime` (tráiler, origen, fechas). El `source`/`priority` los
 * pone `mediaRepository.saveMedia` (AniList = 10).
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

  return {
    animeMedias,
    ...(Object.keys(patch).length > 1 ? { animePatch: patch } : {}),
  }
}
