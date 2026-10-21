import { CONFIG } from '../config/config.js'
import { fetchNextData } from '../libs/nextBuildId.js'
import type { ScrapingTask } from 'types/index.js'
import type { ProxyTarget } from '../libs/transport.js'
import type {
  AnimeThemesAnimeAllFile,
  AnimeThemesArtistAllFile,
} from 'types/animeThemesApi.js'

/**
 * AnimeThemes se sirve como datos de Next.js (`/_next/data/{buildId}/…`), así
 * que el buildId se resuelve en cada corrida (libs/nextBuildId.ts): hardcodearlo
 * rompía el source con 404 en cada deploy del sitio.
 *
 * `ANIME_THEMES_BASE` es la base del sitio; `ANIME_THEMES_BUILD_ID` (opcional)
 * lo fija a mano si hiciera falta.
 */
const siteBase = () => process.env.ANIME_THEMES_BASE || CONFIG.ANIME_THEMES_BASE
const buildIdOverride = () => process.env.ANIME_THEMES_BUILD_ID || undefined

export const fetchAnimeThemes = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
) => {
  const { entityId } = task
  return await fetchNextData(
    siteBase,
    `/anime/${entityId}.json`,
    proxy,
    buildIdOverride()
  )
}

export const fetchArtist = async (task: ScrapingTask, proxy?: ProxyTarget) => {
  const { entityId } = task
  return await fetchNextData(
    siteBase,
    `/artist/${entityId}.json`,
    proxy,
    buildIdOverride()
  )
}

export const fetchAnimeThemesSlugs = async () => {
  return await fetchNextData<AnimeThemesAnimeAllFile>(
    siteBase,
    '/anime.json',
    undefined,
    buildIdOverride()
  )
}

export const fetchArtistsSlugs = async () => {
  return await fetchNextData<AnimeThemesArtistAllFile>(
    siteBase,
    '/artist.json',
    undefined,
    buildIdOverride()
  )
}
