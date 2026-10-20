import { fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ProxyTarget } from '../libs/transport.js'
import type { ScrapingTask } from 'types/index.js'

/**
 * Metadatos de una canción en las tiendas, sin credenciales.
 *
 * - **Spotify (oEmbed)**: devuelve el título exacto de la pista y la carátura
 *   del álbum. No hace falta token y no tiene cuota estricta.
 * - **iTunes (lookup)**: devuelve álbum, artista, duración en ms, fecha de
 *   publicación y carátura.
 *
 * Sirve para completar el catálogo musical: hasta ahora solo teníamos el
 * título, el artista y el enlace; con esto la ficha de canción tiene álbum,
 * duración, fecha y portada.
 */

export interface MusicMetaPayload {
  musicId: number
  spotify: {
    title: string | null
    thumbnail: string | null
    author: string | null
  } | null
  itunes: {
    title: string | null
    artist: string | null
    album: string | null
    durationMs: number | null
    releaseDate: string | null
    artwork: string | null
    trackUrl: string | null
  } | null
}

export const fetchMusicMeta = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<MusicMetaPayload> => {
  const { musicId, spotifyId, appleId } = task.payload as {
    musicId?: number
    spotifyId?: string | null
    appleId?: string | null
  }
  if (!musicId) throw new SkippedTaskError('missing:musicId')
  if (!spotifyId && !appleId) throw new SkippedTaskError('missing:storeIds')

  let spotify: MusicMetaPayload['spotify'] = null
  let itunes: MusicMetaPayload['itunes'] = null

  if (spotifyId) {
    try {
      const data = await fetcher<{
        title?: string
        thumbnail_url?: string
        author_name?: string
      }>({
        url: `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${encodeURIComponent(spotifyId)}`,
        method: 'GET',
        headers: { Accept: 'application/json' },
        agent: proxy,
        timeoutMs: 45_000,
      })
      spotify = {
        title: data?.title ?? null,
        thumbnail: data?.thumbnail_url ?? null,
        author: data?.author_name ?? null,
      }
    } catch {
      // La tienda puede fallar: la otra fuente sigue valiendo.
    }
  }

  if (appleId) {
    try {
      const data = await fetcher<{
        results?: {
          trackName?: string
          artistName?: string
          collectionName?: string
          trackTimeMillis?: number
          releaseDate?: string
          artworkUrl100?: string
          trackViewUrl?: string
        }[]
      }>({
        url: `https://itunes.apple.com/lookup?id=${encodeURIComponent(appleId)}&entity=song`,
        method: 'GET',
        headers: { Accept: 'application/json' },
        agent: proxy,
        timeoutMs: 45_000,
      })
      const track = data?.results?.[0]
      if (track) {
        itunes = {
          title: track.trackName ?? null,
          artist: track.artistName ?? null,
          album: track.collectionName ?? null,
          durationMs: track.trackTimeMillis ?? null,
          releaseDate: track.releaseDate ?? null,
          artwork: track.artworkUrl100
            ? track.artworkUrl100.replace('100x100', '600x600')
            : null,
          trackUrl: track.trackViewUrl ?? null,
        }
      }
    } catch {
      // idem
    }
  }

  if (!spotify && !itunes) {
    throw new Error('musicMeta: ninguna tienda respondió')
  }

  return { musicId, spotify, itunes }
}
