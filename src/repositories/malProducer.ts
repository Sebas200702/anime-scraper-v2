import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { producer } from '../schemas/producer.js'
import { mediaRepository } from './media.js'
import { chunk } from '../utils/chunk.js'
import { unique } from '../utils/deduplicate.js'
import type { MalProducerResult } from '../processors/malProducer.js'
import type { NewMedia } from '../types/index.js'

/**
 * Guarda la ficha de productor/estudio de MAL: logo, año de fundación y
 * descripción.
 *
 * El logo se persiste como variante `logo` con `source = 'mal'` (prioridad 25):
 * si mañana vuelve Jikan, su logo (prioridad 20) se prefiere sin borrar este.
 */
export const malProducerRepository = {
  async saveMalProducer(results: MalProducerResult[]): Promise<number> {
    if (results.length === 0) return 0

    for (const batch of chunk(results, 500)) {
      const values = sql.join(
        batch.map(
          (r) =>
            sql`(${r.producerId}::int, ${r.established}::text, ${r.about}::text)`
        ),
        sql`, `
      )

      // `COALESCE`: no pisa lo que ya haya (Jikan, si algún día responde, trae
      // la ficha canónica). Solo rellena huecos.
      await db.execute(sql`
        UPDATE producer p
        SET established = COALESCE(p.established, v.established),
            about = COALESCE(p.about, v.about)
        FROM (VALUES ${values}) AS v(mal_id, established, about)
        WHERE p.mal_id = v.mal_id
      `)
    }

    const media: NewMedia[] = results
      .filter((r) => r.logo)
      .map((r) => ({
        entityType: 'producer' as const,
        entityId: r.producerId,
        mediaType: 'logo',
        src: r.logo!,
        size: null,
      }))

    const uniqueMedia = unique(
      media,
      (m) => `${m.entityId}:${m.mediaType}:${m.src}`
    )
    const saved = await mediaRepository.saveMedia(uniqueMedia, 'mal')

    return results.length + saved
  },
}
