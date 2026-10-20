import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { music } from '../schemas/music.js'
import { musicMedia } from '../schemas/media.js'
import { chunk } from '../utils/chunk.js'
import { unique } from '../utils/deduplicate.js'
import type { MusicMetaProcessorResult } from '../processors/musicMeta.js'

/**
 * Guarda los metadatos de las canciones (álbum, duración, fecha y portada).
 *
 * Solo rellena huecos: el título y el tipo los fija el merge de fuentes
 * (MAL/ANN/AnimeThemes), y aquí únicamente se completes con lo que publica la
 * tienda. Si el título de la tienda difiere, **no** se pisa el del catálogo.
 */
export const musicMetaRepository = {
  async saveMusicMeta(results: MusicMetaProcessorResult[]): Promise<number> {
    if (results.length === 0) return 0

    for (const batch of chunk(results, 500)) {
      await db.execute(sql`
        UPDATE music m SET
          album = COALESCE(m.album, v.album),
          duration = COALESCE(m.duration, v.duration),
          release_date = COALESCE(m.release_date, v.release_date::date),
          source = COALESCE(m.source, 'store')
        FROM (VALUES ${sql.join(
          batch.map(
            (r) =>
              sql`(${r.musicId}::int, ${r.album}::text, ${r.durationSeconds}::int, ${r.releaseDate}::text)`
          ),
          sql`, `
        )}) AS v(music_id, album, duration, release_date)
        WHERE m.id = v.music_id
      `)
    }

    // La portada de la canción.
    const covers = unique(
      results.flatMap((r) =>
        r.covers.map((c) => ({
          musicId: r.musicId,
          src: c.src,
          size: c.size,
        }))
      ),
      (c) => `${c.musicId}:${c.src}`
    )
    for (const batch of chunk(covers, 500)) {
      await db.execute(sql`
        INSERT INTO music_media (music_id, media_type, src, size, source, priority)
        SELECT v.music_id, 'cover', v.src, v.size, 'store', 30
        FROM (VALUES ${sql.join(
          batch.map(
            (c) => sql`(${c.musicId}::int, ${c.src}::text, ${c.size}::text)`
          ),
          sql`, `
        )}) AS v(music_id, src, size)
        ON CONFLICT (music_id, media_type, src) DO NOTHING
      `)
    }

    return results.length
  },
}
