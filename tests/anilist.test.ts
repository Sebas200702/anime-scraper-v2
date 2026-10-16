import { describe, expect, test } from 'bun:test'
import { processAnimeBanners } from '../src/processors/anilist.js'
import type { ScrapingTask } from '../src/types/index.js'

const task = { payload: { animeId: 1 } } as unknown as ScrapingTask
const base = { id: 1, idMal: 1 }

describe('processAnimeBanners (AniList → media + parche anime)', () => {
  test('mapea banner + poster y el parche (1 request cubre todo)', () => {
    const result = processAnimeBanners(
      {
        data: {
          Media: {
            ...base,
            bannerImage: 'https://s4.anilist.co/file/x/banner.jpg',
            coverImage: {
              extraLarge: 'https://s4.anilist.co/file/x/cover.jpg',
            },
            trailer: { id: 'OhNwckCLzis', site: 'youtube' },
            source: 'MANGA',
            startDate: { year: 1998, month: 4, day: 3 },
            endDate: { year: 1999, month: 4, day: 24 },
          },
        },
      },
      task
    )

    expect(result.animeMedias).toEqual([
      {
        entityType: 'anime',
        entityId: 1,
        mediaType: 'banner',
        src: 'https://s4.anilist.co/file/x/banner.jpg',
        size: null,
      },
      {
        entityType: 'anime',
        entityId: 1,
        mediaType: 'poster',
        src: 'https://s4.anilist.co/file/x/cover.jpg',
        size: null,
      },
    ])
    expect(result.animePatch).toEqual({
      malId: 1,
      trailerYoutubeId: 'OhNwckCLzis',
      trailerEmbedUrl: 'https://www.youtube.com/embed/OhNwckCLzis',
      source: 'Manga',
      airedFrom: '1998-04-03',
      airedTo: '1999-04-24',
    })
  })

  test('sin banner ni poster no produce filas pero sí parche (no es un fallo)', () => {
    const result = processAnimeBanners(
      {
        data: {
          Media: { ...base, bannerImage: null, source: 'ORIGINAL' },
        },
      },
      task
    )
    expect(result.animeMedias).toEqual([])
    expect(result.animePatch).toEqual({ malId: 1, source: 'Original' })
  })

  test('Media nulo (anime sin ficha en AniList) no rompe', () => {
    const result = processAnimeBanners({ data: { Media: null } }, task)
    expect(result.animeMedias).toEqual([])
    expect(result.animePatch).toBeUndefined()
  })

  test('sin animeId no inventa entityId', () => {
    const result = processAnimeBanners(
      { data: { Media: { ...base, bannerImage: 'x' } } },
      { payload: {} } as unknown as ScrapingTask
    )
    expect(result.animeMedias).toEqual([])
  })

  test('tráiler no-youtube y source desconocido se omiten (nunca nulls)', () => {
    const result = processAnimeBanners(
      {
        data: {
          Media: {
            ...base,
            bannerImage: null,
            trailer: { id: 'x', site: 'dailymotion' },
            source: 'WEIRD',
            startDate: { year: null, month: 5, day: 1 },
          },
        },
      },
      task
    )
    expect(result.animeMedias).toEqual([])
    expect(result.animePatch).toBeUndefined()
  })
})
