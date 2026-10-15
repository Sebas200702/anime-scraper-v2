import { fetcher } from '../libs/fetcher.js'
import { CONFIG } from '../config/config.js'
import type { ScrapingTask } from 'types/index.js'
import type { ProxyTarget } from '../libs/transport.js'
import type {
  AnimeThemesAnimeAllFile,
  AnimeThemesArtistAllFile,
} from 'types/animeThemesApi.js'

export const fetchAnimeThemes = async (
  task: ScrapingTask,
  agent: ProxyTarget
) => {
  const { entityId } = task
  const url = `${CONFIG.ANIME_THEMES_BASE}/anime/${entityId}.json`
  const response = await fetcher({
    url,
    method: 'GET',
    agent,
  })
  return response
}
export const fetchAnimeThemesSlugs = async () => {
  const url = `${CONFIG.ANIME_THEMES_BASE}/anime.json`
  console.log('Fetching anime themes slugs from:', url)
  const response = await fetcher<AnimeThemesAnimeAllFile>({
    url,
    method: 'GET',
  })
  return response
}

export const fetchArtist = async (task: ScrapingTask, agent: ProxyTarget) => {
  const { entityId } = task
  const url = `${CONFIG.ANIME_THEMES_BASE}/artist/${entityId}.json`
  const response = await fetcher({
    url,
    method: 'GET',
    agent,
  })
  return response
}

export const fetchArtistsSlugs = async () => {
  const url = `${CONFIG.ANIME_THEMES_BASE}/artist.json`
  const response = await fetcher<AnimeThemesArtistAllFile>({
    url,
    method: 'GET',
  })
  return response
}
