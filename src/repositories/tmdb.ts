import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { mediaRepository } from './media.js'
import { chunk } from '../utils/chunk.js'
import type { TmdbProcessorResult } from '../types/index.js'

/**
 * Guarda el banner (backdrop) y las miniaturas de episodio de TMDB.
 *
 * Las miniaturas se asocian a nuestros episodios **por número**: el
 * `episode_number` de TMDB más el desplazamiento de las temporadas anteriores
 * es la numeración de MAL. Si no existe ese episodio, la imagen se descarta.
 */
export const tmdbRepository = {
  async saveTmdbImages(results: TmdbProcessorResult[]): Promise<number> {
    if (results.length === 0) return 0

    // Banner (variante de prioridad media: AniList sigue siendo la primera).
    const backdrops = results.flatMap((r) =>
      r.backdrops.map((b) => ({
        entityType: 'anime' as const,
        entityId: r.animeId,
        mediaType: 'banner',
        src: b.src,
        size: null,
      }))
    )

    // Miniatura de episodio: necesitamos el id surrogate de nuestro episodio.
    const byAnime = new Map<number, { number: number; src: string }[]>()
    for (const result of results) {
      for (const still of result.stills) {
        byAnime.set(result.animeId, [
          ...(byAnime.get(result.animeId) ?? []),
          still,
        ])
      }
    }

    const episodeMedia: {
      entityType: 'episode'
      entityId: number
      mediaType: string
      src: string
      size: null
    }[] = []

    for (const [animeId, stills] of byAnime) {
      if (stills.length === 0) continue
      const rows = await db.execute(sql`
        SELECT id, number FROM episode WHERE anime_id = ${animeId}
      `)
      const byNumber = new Map(
        (rows.rows as unknown as { id: number; number: number }[]).map((r) => [
          r.number,
          r.id,
        ])
      )
      for (const still of stills) {
        const episodeId = byNumber.get(still.number)
        if (!episodeId) continue
        episodeMedia.push({
          entityType: 'episode',
          entityId: episodeId,
          mediaType: 'thumbnail',
          src: still.src,
          size: null,
        })
      }
    }

    const animeSaved = await mediaRepository.saveMedia(
      [
        ...new Map(
          backdrops.map((m) => [`${m.entityId}:${m.src}`, m])
        ).values(),
      ],
      'tmdb'
    )
    const episodeSaved =
      episodeMedia.length > 0
        ? await mediaRepository.saveMedia(
            [
              ...new Map(
                episodeMedia.map((m) => [`${m.entityId}:${m.src}`, m])
              ).values(),
            ],
            'tmdb'
          )
        : 0

    return animeSaved + episodeSaved
  },
}
