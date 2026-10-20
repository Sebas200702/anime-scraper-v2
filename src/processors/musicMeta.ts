import type { MusicMetaPayload } from '../services/musicMeta.js'
import type { ScrapingTask } from '../types/index.js'

/**
 * Mapea los metadatos de las tiendas a la ficha de la canción.
 *
 * La prioridad la marca la propia fuente: **Spotify** da el título tal cual lo
 * publica la discográfica (con el sufijo "- OP1" si lo lleva) y **iTunes** da
 * el álbum, la duración y la fecha. La portada se guarda como media.
 */
export const processMusicMeta = (
  raw: MusicMetaPayload,
  _task: ScrapingTask
) => {
  const { spotify, itunes } = raw

  // El título de Spotify es el más fiable; el de iTunes es el de la pista
  // concreta (a veces con el sufijo del remix o "- Single Version").
  const title = spotify?.title ?? itunes?.title ?? null
  const artist = itunes?.artist ?? spotify?.author ?? null

  return {
    musicId: raw.musicId,
    title,
    artist,
    album: itunes?.album ?? null,
    durationSeconds:
      itunes?.durationMs !== null && itunes?.durationMs !== undefined
        ? Math.round(itunes.durationMs / 1000)
        : null,
    releaseDate: itunes?.releaseDate ? itunes.releaseDate.slice(0, 10) : null,
    covers: [
      ...(spotify?.thumbnail
        ? [{ src: spotify.thumbnail, size: 'medium' }]
        : []),
      ...(itunes?.artwork ? [{ src: itunes.artwork, size: 'large' }] : []),
    ],
  }
}

export type MusicMetaProcessorResult = ReturnType<typeof processMusicMeta>
