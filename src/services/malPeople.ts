import { CONFIG } from '../config/config.js'
import { fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ProxyTarget } from '../libs/transport.js'
import type { ScrapingTask } from 'types/index.js'

/**
 * Ficha de persona de MAL (`/people/{id}`).
 *
 * La ficha del anime solo muestra ~12 miembros del staff, así que sus retratos
 * quedaban incompletos (`staff_media` cubría ~69%). La página de la persona sí
 * trae su retrato en `og:image`, con la URL completa (sin el prefijo de
 * reescalado `/r/WxH`).
 */
export const fetchMalPeople = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<{ html: string; staffId: number }> => {
  const { staffId } = task.payload as { staffId?: number }
  if (!staffId) throw new SkippedTaskError('missing:staffId')

  const response = await fetcher<string>({
    url: `${CONFIG.MAL_WEB_BASE}/people/${staffId}`,
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
    agent: proxy,
    timeoutMs: 20_000,
    // El body es HTML: sin esto el fetcher lo trataría como JSON.
    isJson: false,
  })

  if (typeof response !== 'string' || response.length < 500) {
    throw new Error('MAL: respuesta HTML vacía o inesperada')
  }
  return { html: response, staffId }
}
