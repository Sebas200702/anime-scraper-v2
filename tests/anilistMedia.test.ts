import { describe, expect, spyOn, test } from 'bun:test'
import { processAnilistMedia } from '../src/processors/anilistMedia.js'
import type { AniListMediaDeep } from '../src/services/anilistMedia.js'
import type { ScrapingTask } from '../src/types/index.js'

const task = (mediaId?: number) =>
  ({ payload: { anilistId: 1, mediaId, mediaType: 'ANIME' } }) as unknown as
    ScrapingTask

const media = (idMal: number | null): AniListMediaDeep => ({
  id: 1,
  idMal,
  type: 'ANIME',
  characters: {
    pageInfo: { total: 1, hasNextPage: false },
    edges: [
      {
        role: 'MAIN',
        node: {
          id: 77,
          name: { full: 'Kengo Dojima', native: 'JUN', alternative: ['Ken'] },
          image: {
            large: 'https://s4.anilist.co/file/anilistcdn/character/large/default.jpg',
          },
          description: null,
          gender: null,
          dateOfBirth: null,
          bloodType: null,
          age: null,
          favourites: null,
        },
        voiceActors: [],
      },
    ],
  },
  staff: { pageInfo: { total: 0, hasNextPage: false }, edges: [] },
  relations: {
    edges: [
      { relationType: 'ALTERNATIVE', node: { id: 2, idMal: 9, type: 'ANIME' } },
      { relationType: 'ADAPTATION', node: { id: 3, idMal: 9, type: 'MANGA' } },
      { relationType: 'SEQUEL', node: { id: 4, idMal: 10, type: null as never } },
      { relationType: 'SIDE_STORY', node: { id: 1, idMal: 5, type: 'ANIME' } },
    ],
  },
  externalLinks: [],
})

describe('processAnilistMedia', () => {
  test('usa el id de la tarea, rol MAL, nativo solo no-ASCII, sin placeholder', () => {
    const r = processAnilistMedia({ mediaType: 'ANIME', media: media(5) }, task(5))
    expect(r.mediaId).toBe(5)
    expect(r.characters[0]).toMatchObject({
      anilistId: 77,
      role: 'Main',
      nativeName: null,
      alternativeNames: ['Ken'],
      image: null,
    })
    // Solo relaciones del mismo tipo de medio, con vocabulario MAL; sin tipo
    // de nodo nulo ni auto-relación.
    expect(r.relations).toEqual([
      { relationType: 'Alternative setting', relatedMalId: 9 },
    ])
  })

  test('idMal distinto al de la tarea → mediaId null y aviso', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    const r = processAnilistMedia({ mediaType: 'ANIME', media: media(6) }, task(5))
    expect(r.mediaId).toBe(null)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
