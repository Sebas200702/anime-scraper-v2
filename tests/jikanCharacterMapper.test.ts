import { describe, expect, test } from 'bun:test'
import { mapCharacter } from '../src/processors/jikan/characterMapper.js'
import type { Character } from '../src/types/jikanApi.js'

const jikanCharacter = (nameKanji: string | null): Character =>
  ({
    mal_id: 7,
    url: 'https://myanimelist.net/character/7',
    images: { jpg: { image_url: null }, webp: { image_url: null } },
    name: 'Black, Jet',
    name_kanji: nameKanji,
    nicknames: [],
    favorites: 0,
    about: 'About',
  }) as unknown as Character

describe('mapCharacter de Jikan (S4: name_kanji solo nativo)', () => {
  test('romaji ASCII → null', () => {
    expect(mapCharacter(jikanCharacter('Black, Jet')).character?.nameKanji).toBe(
      null
    )
  })

  test('nativo no-ASCII se conserva (recortado); vacío → null', () => {
    expect(mapCharacter(jikanCharacter(' ジェット ')).character?.nameKanji).toBe(
      'ジェット'
    )
    expect(mapCharacter(jikanCharacter(null)).character?.nameKanji).toBe(null)
  })
})
