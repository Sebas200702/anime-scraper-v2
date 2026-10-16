import { eq } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { anime } from '../schemas/anime.js'
import { mediaRepository } from './media.js'
import { unique } from '../utils/deduplicate.js'
import type {
  AnimeBannersProcessorResult,
  AnimePatch,
  NewMedia,
} from '../types/index.js'

const patchColumns = (patch: AnimePatch): Record<string, unknown> => {
  const cols: Record<string, unknown> = {}
  if (patch.trailerYoutubeId !== undefined)
    cols.trailerYoutubeId = patch.trailerYoutubeId
  if (patch.trailerEmbedUrl !== undefined)
    cols.trailerEmbedUrl = patch.trailerEmbedUrl
  if (patch.source !== undefined) cols.source = patch.source
  // ISO `YYYY-MM-DD` → timestamptz (medianoche UTC).
  if (patch.airedFrom !== undefined) cols.airedFrom = new Date(patch.airedFrom)
  if (patch.airedTo !== undefined) cols.airedTo = new Date(patch.airedTo)
  return cols
}

export const anilistRepository = {
  async saveAnimeBanners(
    results: AnimeBannersProcessorResult[]
  ): Promise<number> {
    const banners: NewMedia[] = []
    let patched = 0
    for (const result of results) {
      if (result?.animeMedias) banners.push(...result.animeMedias)
      // Parche disperso: solo las columnas presentes (nunca nulls).
      if (result?.animePatch) {
        const cols = patchColumns(result.animePatch)
        if (Object.keys(cols).length > 0) {
          await db
            .update(anime)
            .set(cols)
            .where(eq(anime.malId, result.animePatch.malId))
          patched++
        }
      }
    }

    const uniqueBanners = unique(
      banners,
      (banner) => `${banner.entityId}:${banner.mediaType}:${banner.src}`
    )

    const saved = await mediaRepository.saveMedia(uniqueBanners, 'anilist')
    return saved + patched
  },
}
