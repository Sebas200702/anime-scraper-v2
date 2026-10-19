import { mediaRepository } from './media.js'
import { unique } from '../utils/deduplicate.js'
import type { MalPeopleProcessorResult } from '../types/index.js'

/**
 * Guarda los retratos de personas (staff) del `og:image` de su ficha de MAL.
 * Idempotente: la identidad natural es `(staff_id, media_type, src)`.
 */
export const malPeopleRepository = {
  async saveMalPersonImage(
    results: MalPeopleProcessorResult[]
  ): Promise<number> {
    const media = results
      .flatMap((r) => r.staffMedia)
      .map((m) => ({
        entityType: 'staff' as const,
        entityId: m.entityId,
        mediaType: m.mediaType,
        src: m.src,
        size: null,
      }))
    const items = unique(media, (m) => `${m.entityId}:${m.mediaType}:${m.src}`)
    return await mediaRepository.saveMedia(items, 'mal')
  },
}
