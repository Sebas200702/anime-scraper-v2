import type { ScrapingTask } from 'types/index.js'
import type { ProxyTarget } from '../libs/transport.js'
import { fetcher } from '../libs/fetcher.js'
import { CONFIG } from '../config/config.js'
export const fetchAnimeDetails = async (
  task: ScrapingTask,
  agent: ProxyTarget
) => {
  const { animeId } = task.payload as { animeId: number }
  console.log('Fetching anime details for anime ID:', animeId)
  const url = `${CONFIG.JIKAN_BASE}/anime/${animeId}/full`
  const response = await fetcher({
    url,
    method: 'GET',
    headers: {
      'User-Agent': 'anime-scraper/1.0',
    },
    agent,
  })
  return response
}

export const fetchAnimeCharacters = async (
  task: ScrapingTask,
  agent: ProxyTarget
) => {
  const { animeId } = task.payload as { animeId: number }
  console.log('Fetching anime characters for anime ID:', animeId)
  const url = `${CONFIG.JIKAN_BASE}/anime/${animeId}/characters`
  const response = await fetcher({
    url,
    method: 'GET',
    headers: {
      'User-Agent': 'anime-scraper/1.0',
    },
    agent,
  })
  return response
}

export const fetchAnimeStaff = async (
  task: ScrapingTask,
  agent: ProxyTarget
) => {
  const { animeId } = task.payload as { animeId: number }
  console.log('Fetching anime staff for anime ID:', animeId)
  const url = `${CONFIG.JIKAN_BASE}/anime/${animeId}/staff`
  const response = await fetcher({
    url,
    method: 'GET',
    headers: {
      'User-Agent': 'anime-scraper/1.0',
    },
    agent,
  })
  return response
}
