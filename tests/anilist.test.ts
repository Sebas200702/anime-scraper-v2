import { describe, expect, test } from 'bun:test'
import { processAnimeBanners } from '../src/processors/anilist.js'
import type { ScrapingTask } from '../src/types/index.js'

const task = { payload: { animeId: 1 } } as unknown as ScrapingTask
const base = { id: 1, idMal: 1 }

describe('processAnimeBanners (AniList → banner)', () => {
  test('mapea el banner a anime_media (Banner)', () => {
    const result = processAnimeBanners(
      {
        data: {
          Media: {
            ...base,
            bannerImage: 'https://s4.anilist.co/file/x/banner.jpg',
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
    ])
  })

  test('sin banner no produce filas (no es un fallo)', () => {
    const result = processAnimeBanners(
      { data: { Media: { ...base, bannerImage: null } } },
      task
    )
    expect(result.animeMedias).toEqual([])
  })

  test('Media nulo (anime sin ficha en AniList) no rompe', () => {
    const result = processAnimeBanners({ data: { Media: null } }, task)
    expect(result.animeMedias).toEqual([])
  })

  test('sin animeId no inventa entityId', () => {
    const result = processAnimeBanners(
      { data: { Media: { ...base, bannerImage: 'x' } } },
      { payload: {} } as unknown as ScrapingTask
    )
    expect(result.animeMedias).toEqual([])
  })
})
