/**
 * Arregla las URLs de `music_resolution` de AnimeThemes sin refetch.
 *
 * Los ficheros de AnimeThemes viven en dos hosts:
 *   - vídeo: `https://v.animethemes.moe/{basename}.webm`
 *   - audio: `https://a.animethemes.moe/{basename}.ogg`
 *
 * La versión anterior guardaba `https://animethemes.moe/video/{basename}` (un
 * 301 a `v.`) y `https://animethemes.moe/audio/{basename del vídeo}`, que
 * **daba 404 en todas las filas** (el audio es otro archivo, con `.ogg`).
 *
 * El nombre del audio es el del vídeo con la extensión cambiada (convención
 * de AnimeThemes), así que la reparación es determinista. El refetch
 * (`bun run backfill animeThemes`) además valida los casos raros, pero tarda
 * media hora de proxies: este script arregla las 19.8k filas en segundos.
 *
 * Uso: bun run music:fix-urls
 */
import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'

const main = async () => {
  // 1) Audio: basename del vídeo con `.ogg` en el host de audio.
  //    (usa el `video_url` tal cual está, por eso va antes de reescribirlo)
  const audio = await db.execute(sql`
    UPDATE music_resolution
    SET audio_url = 'https://a.animethemes.moe/' ||
        replace(regexp_replace(video_url, '^.*/', ''), '.webm', '.ogg')
    WHERE audio_url LIKE 'https://animethemes.moe/audio/%'
  `)

  // 2) Vídeo: host final (sin el 301 de `/video/`).
  const video = await db.execute(sql`
    UPDATE music_resolution
    SET video_url = 'https://v.animethemes.moe/' ||
        regexp_replace(video_url, '^.*/video/', '')
    WHERE video_url LIKE 'https://animethemes.moe/video/%'
  `)

  const pending = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM music_resolution
    WHERE audio_url NOT LIKE 'https://a.animethemes.moe/%'
       OR video_url NOT LIKE 'https://v.animethemes.moe/%'
  `)

  console.log(
    `✓ audio: ${audio.rowCount ?? 0} · video: ${video.rowCount ?? 0} · ` +
      `quedan fuera: ${(pending.rows[0] as { n: number }).n}`
  )
  process.exit(0)
}

await main()
