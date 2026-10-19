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
/** Agrupa por anime (para no repetir la consulta de episodios por bloque). */
const groupByAnime = <T extends { animeId: number }>(
  items: T[]
): Map<number, T[]> => {
  const map = new Map<number, T[]>()
  for (const item of items) {
    map.set(item.animeId, [...(map.get(item.animeId) ?? []), item])
  }
  return map
}

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

    // Títulos y fechas de los episodios (rellenan los "Episode NN").
    const episodeInfo = results.flatMap((r) =>
      r.episodes.map((e) => ({
        animeId: r.animeId,
        number: e.number,
        title: e.title,
        aired: e.aired,
      }))
    )
    for (const [animeId, items] of groupByAnime(episodeInfo)) {
      const rows = await db.execute(sql`
        SELECT id, number FROM episode WHERE anime_id = ${animeId}
      `)
      const byNumber = new Map(
        (rows.rows as unknown as { id: number; number: number }[]).map((r) => [
          r.number,
          r.id,
        ])
      )
      const values = items
        .map((item) => {
          const id = byNumber.get(item.number)
          if (!id) return null
          return `(${id}::int, ${item.title ?? null}::text, ${item.aired ?? null}::text)`
        })
        .filter((v): v is string => v !== null)
      if (values.length === 0) continue
      await db.execute(sql`
        UPDATE episode e
        SET title = COALESCE(
              NULLIF(e.title, ''),
              NULLIF(e.title, 'Episode ' || lpad(e.number::text, 2, '0')),
              v.title
            ),
            aired = COALESCE(NULLIF(e.aired, ''), v.aired)
        FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, title, aired)
        WHERE e.id = v.id
      `)
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
