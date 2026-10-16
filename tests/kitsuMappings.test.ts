import { describe, expect, test } from 'bun:test'
import { pickTvdbId } from '../src/shared/kitsuMappings.js'

describe('pickTvdbId (mappings de Kitsu → TVDB)', () => {
  test('encuentra thetvdb/series entre varios sitios', () => {
    expect(
      pickTvdbId({
        data: [
          {
            attributes: {
              externalSite: 'myanimelist/anime',
              externalId: '1',
            },
          },
          {
            attributes: {
              externalSite: 'thetvdb/series',
              externalId: '76885',
            },
          },
        ],
      })
    ).toBe(76885)
  })

  test('vale thetvdb/movie y descarta ids inválidos', () => {
    expect(
      pickTvdbId({
        data: [
          { attributes: { externalSite: 'thetvdb/movie', externalId: 'abc' } },
          { attributes: { externalSite: 'thetvdb/movie', externalId: '123' } },
        ],
      })
    ).toBe(123)
  })

  test('sin TVDB o sin datos → null (slow path por título)', () => {
    expect(
      pickTvdbId({
        data: [
          { attributes: { externalSite: 'anilist/anime', externalId: '1' } },
        ],
      })
    ).toBeNull()
    expect(pickTvdbId({ data: [] })).toBeNull()
    expect(pickTvdbId(null)).toBeNull()
  })
})
