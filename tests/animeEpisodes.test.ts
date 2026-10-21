import { describe, expect, test } from 'bun:test'
import { processAnimeEpisodes } from '../src/processors/animeEpisodes.js'
import type { ScrapingTask } from '../src/types/index.js'

const task = { payload: { anime_id: 1 } } as unknown as ScrapingTask

const kitsuEpisode = (
  number: number,
  thumbnail?: string
): Record<string, unknown> => ({
  attributes: {
    number,
    titles: { en_us: `Ep ${number}` },
    canonicalTitle: `Ep ${number}`,
    synopsis: `syn ${number}`,
    length: 24,
    airdate: '1998-04-03',
    ...(thumbnail ? { thumbnail: { original: thumbnail, meta: {} } } : {}),
  },
})

describe('processAnimeEpisodes (Kitsu → episodios + miniatura)', () => {
  test('emite la miniatura como media de episodio (no la descarta)', () => {
    const result = processAnimeEpisodes(
      {
        data: [
          kitsuEpisode(1, 'https://media.kitsu.io/anime/ep1/original.jpg'),
          kitsuEpisode(2),
        ],
      } as never,
      task
    )

    expect(result.episodes).toHaveLength(2)
    expect(result.episodeMedia).toEqual([
      {
        animeId: 1,
        number: 1,
        src: 'https://media.kitsu.io/anime/ep1/original.jpg',
      },
    ])
  })

  test('sin thumbnail no inventa filas', () => {
    const result = processAnimeEpisodes(
      { data: [kitsuEpisode(1)] } as never,
      task
    )
    expect(result.episodeMedia).toEqual([])
  })
})
