import { CONFIG } from '../config/config.js'
import type { ScrapingTask } from 'types/index.js'
import { fetcher } from '../libs/fetcher.js'
import type { KitsuEpisodesResponse } from 'types/kitsuApi.js'
import type { ProxyAgent } from 'undici'

const BASE = CONFIG.KITSU_BASE || 'https://kitsu.io/api/edge'

export const fetchAnimeEpisodes = async (
  task: ScrapingTask,
  agent: ProxyAgent
) => {
  const { kitsu_id } = task.payload as { kitsu_id: number }

  if (!kitsu_id) {
    throw new Error('Task payload missing kitsu_id')
  }

  const allEpisodes = []
  let offset = 0
  let hasNext = true
  const limit = 20

  while (hasNext) {
    const url = `${BASE}/anime/${kitsu_id}/episodes?page[limit]=${limit}&page[offset]=${offset}`

    const response = await fetcher<KitsuEpisodesResponse>({
      url,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      agent,
    })

    allEpisodes.push(...response.data)
  }

  return { data: allEpisodes }
}
