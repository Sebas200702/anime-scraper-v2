import { CONFIG } from '../config/config.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ScrapingTask } from 'types/index.js'
import { fetcher } from '../libs/fetcher.js'
import type { KitsuEpisodesResponse } from 'types/kitsuApi.js'
import type { ProxyTarget } from '../libs/transport.js'
import { createRateLimiter } from '../utils/rateLimit.js'

const BASE = CONFIG.KITSU_BASE || 'https://kitsu.io/api/edge'

// El limiter del worker se consume una vez por tarea, pero esta tarea pagina
// (20 eps/página) y una serie larga son decenas de requests seguidos: el gate
// real tiene que estar por página. Al ser módulo-por-worker y con 1 worker,
// acota el agregado contra Kitsu (60/min).
const kitsuLimiter = createRateLimiter(1, 50)

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

    const response = await fetcher<KitsuEpisodesResponse>({
      url,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      agent,
    })

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
