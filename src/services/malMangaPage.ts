import { CONFIG } from '../config/config.js'
import { fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import { parseMalMangaPage } from '../shared/malMangaPageHtml.js'
import type { ProxyTarget } from '../libs/transport.js'
import type { ScrapingTask } from 'types/index.js'

/**
 * Página de una obra impresa de MAL (`/manga/{id}`): el equipo (autores,
 * ilustradores, editores) con el **id de persona** de MAL.
 *
 * Es la única fuente con ese id: la API v2 no expone el staff de un manga y
 * AniList lo da con nombres parciales o de seudónimo (no cruzables).
 */
export const fetchMalMangaPage = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<{ mangaId: number; staff: ReturnType<typeof parseMalMangaPage> }> => {
  const { mangaId } = task.payload as { mangaId?: number }
  if (!mangaId) throw new SkippedTaskError('missing:mangaId')

  const html = await fetcher<string>({
    url: `${CONFIG.MAL_WEB_BASE}/manga/${mangaId}/_/`,
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
    agent: proxy,
    timeoutMs: 30_000,
    isJson: false,
  })

  if (typeof html !== 'string' || html.length < 5_000) {
    throw new Error('MAL: respuesta HTML vacía o inesperada')
  }
  return { mangaId, staff: parseMalMangaPage(html) }
}
