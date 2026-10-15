import { CONFIG } from '../config/config.js'
import type { ScrapingTask } from '../types/index.js'
import { fetcher } from '../libs/fetcher.js'
import type { ProxyTarget } from '../libs/transport.js'

const GENERIC_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Cache-Control': 'max-age=0',
}

// Fetches the main page of an anime for general details.
// URL: https://myanimelist.net/anime/:id
export const fetchAnimeFull = async (
  task: ScrapingTask,
  agent?: ProxyTarget
) => {
  const url = `${CONFIG.MAL_BASE}/anime/${task.payload?.animeId}`
  return await fetcher({ url, headers: GENERIC_HEADERS, isJson: false, agent })
}

// Fetches the characters and voice actors page for an anime.
// URL: https://myanimelist.net/anime/:id/_/characters
export const fetchAnimeCharacters = async (
  task: ScrapingTask,
  agent?: ProxyTarget
) => {
  const url = `${CONFIG.MAL_BASE}/anime/${task.payload?.animeId}/_/characters`
  return await fetcher({ url, headers: GENERIC_HEADERS, isJson: false, agent })
}

// Fetches the staff page for an anime.
// URL: https://myanimelist.net/anime/:id/_/staff
export const fetchAnimeStaff = async (
  task: ScrapingTask,
  agent?: ProxyTarget
) => {
  const url = `${CONFIG.MAL_BASE}/anime/${task.payload?.animeId}/_/staff`
  return await fetcher({ url, headers: GENERIC_HEADERS, isJson: false, agent })
}
