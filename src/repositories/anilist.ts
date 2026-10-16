import { mediaRepository } from './media.js'
import { unique } from '../utils/deduplicate.js'
import type { AnimeBannersProcessorResult, NewMedia } from '../types/index.js'

export const anilistRepository = {
  async saveAnimeBanners(
    results: AnimeBannersProcessorResult[]
  ): Promise<number> {
    const banners: NewMedia[] = []
    for (const result of results) {
      if (result?.animeMedias) banners.push(...result.animeMedias)
    }

    const uniqueBanners = unique(
      banners,
      (banner) => `${banner.entityId}:${banner.mediaType}:${banner.src}`
    )

    return await mediaRepository.saveMedia(uniqueBanners, 'anilist')
  },
}
