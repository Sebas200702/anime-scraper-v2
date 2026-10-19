import { CONFIG } from '../config/config.js'
import { fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ProxyTarget } from '../libs/transport.js'
import type { ScrapingTask } from 'types/index.js'

/**
 * Ficha HTML de MAL (`/anime/{id}`): la **única** vía a personajes, seiyuus y
 * staff con ids MAL (la API v2 ignora esos campos; AniList/Kitsu no exponen
 * `idMal` para personajes).
 *
 * Se pide con gzip (Bun lo negocia solo): ~35-48 KB por ficha, así que las
 * ~30.5k fichas caben en el trial (~1.1 GB de los 10 GB).
 */
export const fetchMalCharacters = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<{ html: string; animeId: number }> => {
  const { animeId } = task.payload as { animeId?: number }
  if (!animeId) throw new SkippedTaskError('missing:animeId')

  const response = await fetcher<string>({
    url: `${CONFIG.MAL_WEB_BASE}/anime/${animeId}`,
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
    agent: proxy,
    // 10 s: la ficha llega en <2 s por un proxy sano (~40 KB gzip). Con 20 s
    // los proxies muertos quemaban el hueco entero y el throughput caía a
    // ~1 ficha/s (30k fichas = 8 h). El reintento a nivel de tarea cubre lo
    // que se cae, y con otro proxy.
    timeoutMs: 10_000,
    // 2 intentos por request: el reintento de tarea (attempts) ya cubre el
    // resto, sin multiplicar por 3 el tiempo muerto de cada proxy malo.
    retry: { maxAttempts: 2 },
    // El body es HTML, no JSON: sin esto el fetcher lo trataría como JSON y un
    // marcador de WAF de la página normal lo clasificaría como `blocked`.
    isJson: false,
  })

  if (typeof response !== 'string' || response.length < 1000) {
    throw new Error('MAL: respuesta HTML vacía o inesperada')
  }
  return { html: response, animeId }
}
