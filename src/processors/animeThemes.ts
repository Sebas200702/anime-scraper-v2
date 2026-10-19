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
  resources: { site: string; link?: string }[]
): number | null {
  const malResource = resources.find(
    (r) => r.site === 'MyAnimeList' || r.link?.includes('myanimelist.net')
  )

  if (!malResource?.link) return null

  // Solo `/anime/{id}`: aceptar cualquier segmento colaba ids de manga
  // (`/manga/123`) como si fueran del anime 123.
  const regex = /myanimelist\.net\/anime\/(\d+)/
  const match = regex.exec(malResource.link)

  if (!match) return null

  return Number(match[1])
}

// Generate audio URL from basename
//
// Ojo con el host y el basename: el audio vive en `a.animethemes.moe/{ogg}` y el
// vídeo en `v.animethemes.moe/{basename}`. La versión anterior armaba
// `animethemes.moe/audio/{basename del video}` y **todas** las filas daban 404
// (además el basename era el del vídeo, no el del audio: `video.audio.basename`).
export function generateAudioUrl(audioBasename?: string | null) {
  if (!audioBasename) return null
  return `https://a.animethemes.moe/${audioBasename}`
}

// Generate video URL from basename
export function generateVideoUrl(basename: string) {
  if (!basename) return null
  return `https://v.animethemes.moe/${basename}`
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
    artistMedias: artistData.images.map((image) => {
      let size: 'large' | 'small' | 'default'
      if (image.facet === 'Large Cover') {
        size = 'large'
      } else if (image.facet === 'Small Cover') {
        size = 'small'
      } else {
        size = 'default'
      }
      return {
        artistName: artistData.name,
        entityType: 'artist',
        mediaType: 'picture',
        src: image.link,
        size,
      }
    }),
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
      title: theme.song?.title ?? 'Unknown Title',
      id: theme.id,
    })),
    musicResolutions:
      themesData.flatMap((theme) =>
        (theme.entries || []).flatMap((entry) =>
          (entry.videos || []).map((video) => ({
            songId: video.id,
            musicVersionId: entry.id,

            resolution: String(video.resolution),
            // El audio es un archivo propio (`video.audio.basename`, .ogg): usar
            // el basename del vídeo apuntaba a un 404.
            audioUrl: generateAudioUrl(video.audio?.basename) || '',
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
      theme.song?.performances.map((performance) => ({
        musicId: theme.id,
        artistName: performance.artist?.name || 'Unknown Artist',
      }))
    ),
  }
  console.log(
    `Processed ${animeThemesResult.musics.length} musics for anime ID: ${anime_id}`
  )
  return animeThemesResult
}
