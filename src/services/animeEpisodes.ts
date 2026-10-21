import { CONFIG } from '../config/config.js'
import { FetchError } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ScrapingTask } from 'types/index.js'
import { fetcher } from '../libs/fetcher.js'
import type { KitsuEpisodesResponse } from 'types/kitsuApi.js'
import type { ProxyTarget } from '../libs/transport.js'
import { createRateLimiter } from '../utils/rateLimit.js'

const BASE = CONFIG.KITSU_BASE || 'https://kitsu.io/api/edge'

// El limiter del worker se consume una vez por tarea, pero esta tarea pagina
// (20 eps/página) y una serie larga son decenas de requests seguidos: el gate
// real tiene que estar por página. Techo agregado para el backfill (10 IPs);
// la cuota por IP (Kitsu 60/min) la aplica el `RateGate` por (host, IP).
const kitsuLimiter = createRateLimiter(10, 600)

export const fetchAnimeEpisodes = async (
  task: ScrapingTask,
  agent: ProxyTarget
) => {
  const { kitsu_id } = task.payload as { kitsu_id: number }

  if (!kitsu_id) {
    // Sin id cruzado no hay nada que pedir: se re-armará cuando el mapping
    // (animeMapping) lo resuelva.
    throw new SkippedTaskError('missing:kitsu_id')
  }

  const allEpisodes = []
  let offset = 0
  let hasNext = true
  const limit = 20

  while (hasNext) {
    await kitsuLimiter()
    const url = `${BASE}/anime/${kitsu_id}/episodes?page[limit]=${limit}&page[offset]=${offset}`

    let response: KitsuEpisodesResponse
    try {
      response = await fetcher<KitsuEpisodesResponse>({
        url,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        agent,
        timeoutMs: 10_000,
      })
    } catch (error) {
      // Kitsu responde 404 cuando el anime existe pero **no tiene**
      // episodios: no es un fallo, es "no hay datos". Sin esto la tarea
      // quemaba sus 3 intentos y acababa en dead_letter (1.565 animes).
      if (error instanceof FetchError && error.kind === 'not_found') {
        throw new SkippedTaskError('kitsu:no_episodes')
      }
      throw error
    }

    if (!response.data || response.data.length === 0) {
      break
    }

    allEpisodes.push(...response.data)
    offset += limit

    if (response.data.length < limit) {
      hasNext = false
    }
  }

  return { data: allEpisodes }
}
