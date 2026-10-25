import { CONFIG } from '../config/config.js'
import { fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ProxyTarget } from '../libs/transport.js'
import type { ScrapingTask } from 'types/index.js'

/**
 * Ficha HTML de un productor/estudio de MAL (`/anime/producer/{id}`).
 *
 * Es la fuente de los **logos** de productora: la API v2 de MAL solo devuelve
 * `{ id, name }` para `studios`/`producers`, y AniList no expone logo de
 * estudio. MAL sí publica el logo en el `<meta og:image>`
 * (`cdn.myanimelist.net/.../company_logos/...`), junto con `Established` y la
 * descripción del estudio.
 */
export const fetchMalProducer = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<{ html: string; producerId: number }> => {
  const { producerId } = task.payload as { producerId?: number }
  if (!producerId) throw new SkippedTaskError('missing:producerId')

  const html = await fetcher<string>({
    url: `${CONFIG.MAL_WEB_BASE}/anime/producer/${producerId}`,
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
    agent: proxy,
    timeoutMs: 10_000,
    retry: { maxAttempts: 2 },
    // El body es HTML, no JSON.
    isJson: false,
  })

  return { html, producerId }
}
