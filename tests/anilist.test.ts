import { describe, expect, test } from 'bun:test'
import { processAniListCatalog, processAnimeBanners } from '../src/processors/anilist.js'
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

  test('sinopsis pela el HTML y relations solo anime con idMal', () => {
    const result = processAnimeBanners(
      {
        data: {
          Media: {
            ...base,
            bannerImage: null,
            description:
              'A: <b>space</b> western.<br><br>Second line &amp; more.',
            relations: {
              edges: [
                {
                  relationType: 'SEQUEL',
                  node: { id: 21, type: 'ANIME', idMal: 5 },
                },
                {
                  relationType: 'ADAPTATION',
                  node: { id: 22, type: 'MANGA', idMal: null },
                },
                {
                  relationType: 'SIDE_STORY',
                  node: { id: 23, type: 'ANIME', idMal: null },
                },
                {
                  relationType: 'FANFARE',
                  node: { id: 24, type: 'ANIME', idMal: 6 },
                },
                {
                  relationType: 'PREQUEL',
                  node: { id: 1, type: 'ANIME', idMal: 1 },
                },
              ],
            },
          },
        },
      },
      task
    )
    expect(result.animePatch?.synopsis).toBe(
      'A: space western.\nSecond line & more.'
    )
    // Solo la sequel con idMal (el manga, el sin idMal, el tipo raro y el
    // self-loop se descartan).
    expect(result.animeRelations).toEqual([
      { animeId: 1, relationType: 'Sequel', relatedAnimeId: 5 },
    ])
  })

  test('broadcast sale del próximo episodio en hora JST', () => {
    // 2026-10-19T15:00:00Z = martes 00:00 JST (convención Jikan: día/hora
    // normalizados, sin "24:00").
    const result = processAnimeBanners(
      {
        data: {
          Media: {
            ...base,
            bannerImage: null,
            nextAiringEpisode: { airingAt: 1792422000, episode: 3 },
          },
        },
      },
      task
    )
    expect(result.animePatch).toMatchObject({
      malId: 1,
      broadcastDay: 'Tuesdays',
      broadcastTime: '00:00',
      broadcastTimezone: 'Asia/Tokyo',
    })
  })

  test('sin airing no hay broadcast (terminada)', () => {
    const result = processAnimeBanners(
      { data: { Media: { ...base, bannerImage: null } } },
      task
    )
    expect(result.animePatch).toBeUndefined()
  })
})

describe('processAniListCatalog (backfill en bulk, 50/request)', () => {
  test('procesa solo los media con idMal y reusa el mapeo por-anime', () => {
    const result = processAniListCatalog(
      {
        media: [
          {
            id: 1,
            idMal: 1,
            bannerImage: 'https://x/b.jpg',
            coverImage: { extraLarge: 'https://x/c.jpg' },
            description: 'Hola<br>mundo',
          },
          // Sin ficha MAL: se salta.
          { id: 2, idMal: null, bannerImage: 'https://x/y.jpg' },
        ],
      },
      { payload: {} } as unknown as ScrapingTask
    )

    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.animeMedias).toEqual([
      {
        entityType: 'anime',
        entityId: 1,
        mediaType: 'banner',
        src: 'https://x/b.jpg',
        size: null,
      },
      {
        entityType: 'anime',
        entityId: 1,
        mediaType: 'poster',
        src: 'https://x/c.jpg',
        size: null,
      },
    ])
    expect(result.results[0]?.animePatch?.synopsis).toBe('Hola\nmundo')
  })
})
