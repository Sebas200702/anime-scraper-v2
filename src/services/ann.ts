/**
 * Enciclopedia de Anime News Network (`/encyclopedia/anime.php?id=`).
 *
 * Única fuente gratuita que publica los OP/ED **con nº de tema, artista y rango
 * de episodios** de forma sistemática. El id de ANN llega del dump offline
 * (emparejamiento exacto, sin búsquedas por título), así que no hace falta
 * ningún descubrimiento previo.
 *
 * `robots.txt` de ANN solo prohíbe `/video/` y rutas de sponsor: la
 * enciclopedia es accesible.
 */
import { CONFIG } from '../config/config.js'
import { fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ProxyTarget } from '../libs/transport.js'
import type { ScrapingTask } from 'types/index.js'

export const ANN_BASE =
  process.env.ANN_BASE ?? 'https://www.animenewsnetwork.com/encyclopedia'

export const fetchAnnThemes = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<{ html: string; annId: number }> => {
  const { annId } = task.payload as { annId?: number }
  if (!annId) throw new SkippedTaskError('missing:annId')

  const response = await fetcher<string>({
    url: `${ANN_BASE}/anime.php?id=${annId}`,
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
    agent: proxy,
    timeoutMs: 15_000,
    retry: { maxAttempts: 2 },
    // El body es HTML: sin esto el fetcher lo trataría como JSON.
    isJson: false,
  })

  if (typeof response !== 'string' || response.length < 1000) {
    throw new Error('ANN: respuesta HTML vacía o inesperada')
  }
  return { html: response, annId }
}
