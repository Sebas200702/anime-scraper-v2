import { CONFIG } from '../config/config.js'
import { fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import { parseMalCharactersPage } from '../shared/malCharactersHtml.js'
import type { ProxyTarget } from '../libs/transport.js'
import type { ScrapingTask } from 'types/index.js'

/**
 * Reparto **completo** de un anime según la página de personajes de MAL
 * (`/anime/{id}/characters`).
 *
 * Por qué la web y no la API: `/v2/anime/{id}/characters` da los ids y el rol,
 * pero **no** el nombre, ni el retrato, ni las voces; y el id de personaje de
 * MAL vive en un espacio **distinto** del de persona (`/v2/people/{id}`), así
 * que la ficha de persona no sirve para los personajes. La página de
 * personajes trae todo en una sola petición: id, nombre, nativo, rol,
 * favoritos, retrato y las voces con su idioma.
 *
 * La ficha principal del anime solo lista los diez primeros: esta es la vía
 * para el reparto entero.
 */
export const fetchMalCharacters = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<{ animeId: number; html: string }> => {
  const { animeId } = task.payload as { animeId?: number }
  if (!animeId) throw new SkippedTaskError('missing:animeId')

  // Ojo con la URL: `/anime/{id}/characters` se interpreta como el **slug**
  // "characters" y MAL redirige a la ficha principal (sin reparto). La página
  // de personajes necesita el slug real, pero **cualquier** slug sirve:
  // `/anime/{id}/_/characters` devuelve la lista entera.
  const html = await fetcher<string>({
    url: `${CONFIG.MAL_WEB_BASE}/anime/${animeId}/_/characters`,
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
    agent: proxy,
    timeoutMs: 40_000,
    // El body es HTML: sin esto el fetcher lo trataría como JSON.
    isJson: false,
  })

  if (typeof html !== 'string' || html.length < 5_000) {
    throw new Error('MAL: respuesta HTML vacía o inesperada')
  }
  return { animeId, html }
}
