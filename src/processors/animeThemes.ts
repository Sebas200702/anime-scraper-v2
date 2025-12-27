import type {
  AnimeArtistProcessorResult,
  AnimeMusicProcessorResult,
  ScrapingTask,
} from '../types/index.js'
import type {
  AnimeThemesNextData,
  AnimeThemesArtistNextData,
} from 'types/animeThemesApi.js'
export function extractMalId(
  resources: { site: string; link?: string }[] | null
) {
  if (!resources) return null

  const malResource = resources.find(
    (r) => r.site === 'MyAnimeList' || r.link?.includes('myanimelist.net')
  )

  if (!malResource?.link) return null

  // Captura cualquier ID numérico al final de la URL
  const regex = /\/(\d+)(?:\/)?$/
  const match = regex.exec(malResource.link)

  return Number.parseInt(match?.[1] ?? '') || null
}

// Generate audio URL from basename
export function generateAudioUrl(basename: string) {
  if (!basename) return null
  return `https://animethemes.moe/audio/${basename}`
}

// Generate video URL from basename
export function generateVideoUrl(basename: string) {
  if (!basename) return null
  return `https://animethemes.moe/video/${basename}`
}
export const processArtist = (
  rawData: AnimeThemesArtistNextData,
  task: ScrapingTask
) => {
  const artistData = rawData.pageProps.artist

  const malId = extractMalId(artistData.resources)
  console.log(`Processing artist: ${artistData.name} (MAL ID: ${malId})`)

  const artistResult: AnimeArtistProcessorResult = {
    artist: {
      malId,
      name: artistData.name,
    },

  }
  return artistResult
}

export const processAnimeThemes = (
  rawData: AnimeThemesNextData,
  task: ScrapingTask
) => {
  const themesData = rawData.pageProps.anime.themes
  const anime_id = extractMalId(rawData.pageProps.anime.resources)

  const animeThemesResult: AnimeMusicProcessorResult = {
    animeMusics: anime_id
      ? themesData.map((theme) => ({
          animeId: anime_id,
          musicId: theme.id,
        }))
      : [],
    musics: themesData.map((theme) => ({
      type: theme.type ?? 'Unknown',
      title: theme.song.title ?? 'Unknown Title',
      id: theme.id,
    })),
    musicResolutions:
      themesData.flatMap((theme) =>
        (theme.entries || []).flatMap((entry) =>
          (entry.videos || []).map((video) => ({
            songId: entry.id,
            musicVersionId: theme.id,

            resolution: video.resolution,
            audioUrl: generateAudioUrl(video.basename) || '',
            videoUrl: generateVideoUrl(video.basename) || '',
          }))
        )
      ) ?? [],

    musicVersions:
      themesData.flatMap((theme) =>
        (theme.entries || []).map((entry) => ({
          musicId: theme.id,
          version: entry.version,
          versionId: entry.id,
        }))
      ) ?? [],
    musicArtists: themesData.flatMap((theme) =>
      theme.song.performances.map((performance) => ({
        musicId: theme.id,
        artistName: performance.artist.name,
      }))
    ),
  }
  console.log(
    `Processed ${animeThemesResult.musics.length} musics for anime ID: ${anime_id}`
  )
  return animeThemesResult
}
