import { describe, expect, test } from 'bun:test'
import { decideMapping } from '../src/shared/mappingRepair.js'

describe('decideMapping', () => {
  test('el cruce exacto manda y aporta tvdb/anilist', () => {
    expect(
      decideMapping({ kitsuId: 1555, tvdbId: 10, anilistId: null }, {
        kitsuId: 11,
        anilistId: 20,
        tvdbId: 78857,
      }, null)
    ).toEqual({
      kitsuId: 11,
      tvdbId: 78857,
      anilistId: 20,
      tvdbTrusted: true,
      sawExactCrossmap: true,
    })
  })

  test('un kitsu adivinado y sin cruce se limpia (y su tvdb con él)', () => {
    expect(
      decideMapping({ kitsuId: 49739, tvdbId: 999, anilistId: 42 }, undefined, null)
    ).toEqual({
      kitsuId: null,
      tvdbId: null,
      anilistId: 42,
      tvdbTrusted: false,
      sawExactCrossmap: false,
    })
  })

  test('sin cruce, si el kitsu ya era el correcto, lo derivado se conserva', () => {
    expect(
      decideMapping({ kitsuId: 42, tvdbId: 777, anilistId: null }, undefined, 42)
    ).toEqual({
      kitsuId: 42,
      tvdbId: 777,
      anilistId: null,
      tvdbTrusted: true,
      sawExactCrossmap: false,
    })
  })

  test('el dump solo se usa cuando Kitsu no conoce el MAL id', () => {
    expect(
      decideMapping({ kitsuId: 999, tvdbId: 5, anilistId: null }, undefined, 123)
    ).toMatchObject({ kitsuId: 123, tvdbId: null, tvdbTrusted: false })
  })

  test('nunca reemplaza un anilist_id existente', () => {
    expect(
      decideMapping({ kitsuId: null, tvdbId: null, anilistId: 20 }, {
        kitsuId: 11,
        anilistId: 999,
        tvdbId: null,
      }, null).anilistId
    ).toBe(20)
  })
})
