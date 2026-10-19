/**
 * Episodios de una serie de TVDB (`/series/{id}/episodes/default`).
 *
 * Trae la **imagen de cada episodio** (`/banners/episodes/...`), que es la
 * miniatura que Kitsu no tiene para la mayoría de los capítulos. TVDB ordena
 * los episodios en varios criterios ("Aired Order", "DVD Order", "Regional
 * Order"…) y cada uno reinicia la numeración, así que el mapeo a nuestra
 * numeración (la de MAL) **no** es directo: lo resuelve el repositorio
 * comparandoRecuento, fechas de emisión y títulos, y descarta lo que no
 * encaja (preferimos dejar la miniatura vacía antes que colgar la imagen de
 * otro episodio).
 */
import { CONFIG } from '../config/config.js'
import { fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ProxyTarget } from '../libs/transport.js'
import type { ScrapingTask } from 'types/index.js'

export interface TvdbEpisode {
  number?: number
  absoluteNumber?: number
  aired?: string | null
  name?: string | null
  image?: string | null
}

export const fetchTvdbEpisodes = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<{ animeId: number; tvdbId: number; episodes: TvdbEpisode[] }> => {
  const { animeId, tvdbId } = task.payload as {
    animeId?: number
    tvdbId?: number
  }
  if (!animeId) throw new SkippedTaskError('missing:animeId')
  if (!tvdbId) throw new SkippedTaskError('missing:tvdbId')

  const response = await fetcher<{
    data?: { episodes?: TvdbEpisode[] }
  }>({
    url: `${CONFIG.TVDB_BASE}/series/${tvdbId}/episodes/default`,
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${await tvdbToken()}`,
    },
    agent: proxy,
    timeoutMs: 15_000,
    retry: { maxAttempts: 2 },
  })

  return {
    animeId,
    tvdbId,
    episodes: response.data?.episodes ?? [],
  }
}

/** Token de TVDB (cacheado en el propio módulo). */
let cachedToken: { token: string; at: number } | null = null
const TOKEN_TTL_MS = 25 * 60 * 1000

const tvdbToken = async (): Promise<string> => {
  if (cachedToken && Date.now() - cachedToken.at < TOKEN_TTL_MS) {
    return cachedToken.token
  }
  const { authenticate } = await import('../libs/tvdb.js')
  const token = await authenticate()
  cachedToken = { token, at: Date.now() }
  return token
}
