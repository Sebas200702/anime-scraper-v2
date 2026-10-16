import type { AnimeBannersProcessorResult, NewMedia } from '../types/index.js'
import type { AniListBannerResponse } from 'types/anilistApi.js'
import type { ScrapingTask } from '../types/index.js'

/**
 * Mapea el banner de AniList a `anime_media` con `mediaType: 'Banner'`.
 * El `source`/`priority` los pone `mediaRepository.saveMedia` (AniList = 10),
 * así que sus banners quedan **primero** frente a los de TVDB (30).
 */
export const processAnimeBanners = (
  rawData: AniListBannerResponse,
  task: ScrapingTask
): AnimeBannersProcessorResult => {
  const { animeId } = task.payload as { animeId?: number }
  const media = rawData.data?.Media

  const animeMedias: NewMedia[] = []
  if (animeId && media?.bannerImage) {
    animeMedias.push({
      entityType: 'anime',
      entityId: animeId,
      // El vocabulario es el de anidev (`MediaType`), en minúsculas.
      mediaType: 'banner',
      src: media.bannerImage,
      size: null,
    })
  }

  return { animeMedias }
}
