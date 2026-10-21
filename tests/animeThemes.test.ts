import { describe, expect, test } from 'bun:test'
import {
  extractMalId,
  generateAudioUrl,
  generateVideoUrl,
  processAnimeThemes,
} from '../src/processors/animeThemes.js'
import type { ScrapingTask } from '../src/types/index.js'

/**
 * Los OP/ED se reproducen **dentro de la app**: su ruta `/media` proxya los
 * bytes con allowlist de MIME (`video/*`, `audio/*`) y el CSP permite
 * `a.animethemes.moe`/`v.animethemes.moe`. Estas URLs tienen que ser las finales:
 * `animethemes.moe/audio/...` daba 404 y todo el audio quedó mudo.
 */
describe('URLs de AnimeThemes (reproducción en la app)', () => {
  test('el audio usa a.animethemes.moe y su propio basename (.ogg)', () => {
    expect(generateAudioUrl('Naruto-OP1.ogg')).toBe(
      'https://a.animethemes.moe/Naruto-OP1.ogg'
    )
  })

  test('el vídeo usa v.animethemes.moe (evita el 301 de /video/)', () => {
    expect(generateVideoUrl('Naruto-OP1.webm')).toBe(
      'https://v.animethemes.moe/Naruto-OP1.webm'
    )
  })

  test('sin basename no inventa URL', () => {
    expect(generateAudioUrl(null)).toBeNull()
    expect(generateAudioUrl(undefined)).toBeNull()
    expect(generateVideoUrl('')).toBeNull()
  })

  test('las resoluciones llevan audio y vídeo reproducibles', () => {
    const raw = {
      pageProps: {
        anime: {
          resources: [
            { site: 'MyAnimeList', link: 'https://myanimelist.net/anime/20' },
          ],
          themes: [
            {
              type: 'OP',
              id: 111,
              song: { title: 'Hero', performances: [] },
              entries: [
                {
                  version: 1,
                  id: 222,
                  videos: [
                    {
                      id: 333,
                      basename: 'Naruto-OP1.webm',
                      resolution: 1080,
                      audio: { basename: 'Naruto-OP1.ogg' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    } as any

    const result = processAnimeThemes(raw, {} as ScrapingTask)
    expect(result.musicResolutions).toEqual([
      {
        songId: 333,
        musicVersionId: 222,
        resolution: '1080',
        audioUrl: 'https://a.animethemes.moe/Naruto-OP1.ogg',
        videoUrl: 'https://v.animethemes.moe/Naruto-OP1.webm',
      },
    ])
  })

  test('sin audio en el vídeo deja audioUrl vacío (no una URL muerta)', () => {
    const raw = {
      pageProps: {
        anime: {
          resources: [],
          themes: [
            {
              type: 'ED',
              id: 1,
              song: { title: 'X', performances: [] },
              entries: [
                {
                  version: 1,
                  id: 2,
                  videos: [{ id: 3, basename: 'A-ED1.webm', resolution: 720 }],
                },
              ],
            },
          ],
        },
      },
    } as any
    expect(
      processAnimeThemes(raw, {} as ScrapingTask).musicResolutions[0]
    ).toMatchObject({
      audioUrl: '',
      videoUrl: 'https://v.animethemes.moe/A-ED1.webm',
    })
  })
})

describe('extractMalId', () => {
  test('solo acepta /anime/ (no ids de manga)', () => {
    expect(
      extractMalId([
        { site: 'MyAnimeList', link: 'https://myanimelist.net/anime/1534' },
      ])
    ).toBe(1534)
    expect(
      extractMalId([
        { site: 'MyAnimeList', link: 'https://myanimelist.net/manga/1534' },
      ])
    ).toBeNull()
  })
})
