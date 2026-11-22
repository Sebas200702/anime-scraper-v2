import { describe, expect, test } from 'bun:test'
import {
  characterNameKeys,
  nativeNameOrNull,
  normalizeCharacterName,
} from '../src/utils/characterName.js'

const same = (a: string, b: string) =>
  expect(normalizeCharacterName(a)).toBe(normalizeCharacterName(b))

describe('normalizeCharacterName', () => {
  test('invierte "Apellido, Nombre" ↔ "Nombre Apellido"', () => {
    same('Honekawa, Suneo', 'Suneo Honekawa')
  })

  test('colapsa vocales largas romanizadas (ou/oo/uu/aa/ee/ii)', () => {
    same('Doujima, Kengo', 'Kengo Dojima')
    same('Monchi, Jouji', 'Joji Monchi')
  })

  test('macrones → vocal simple', () => {
    same('Satō, Kōta', 'Kota Sato')
  })

  test('minúsculas, sin puntuación y espacios repetidos', () => {
    same('Jean-Pierre  Polnareff.', 'polnareff jean pierre')
  })

  test('nombres distintos no colisionan', () => {
    expect(normalizeCharacterName('Hayashi')).not.toBe(
      normalizeCharacterName('Hayata')
    )
  })

  test('vacío o solo puntuación → null', () => {
    expect(normalizeCharacterName('')).toBeNull()
    expect(normalizeCharacterName('   ')).toBeNull()
    expect(normalizeCharacterName(' , . ')).toBeNull()
    expect(normalizeCharacterName(null)).toBeNull()
    expect(normalizeCharacterName(undefined)).toBeNull()
  })
})

describe('characterNameKeys', () => {
  test('nombre completo + alternativos, sin duplicados ni vacíos', () => {
    const keys = characterNameKeys('Honekawa, Suneo', [
      'Suneo Honekawa',
      'Suneo',
      '',
      null,
    ])
    expect(keys).toEqual([
      normalizeCharacterName('Suneo Honekawa'),
      normalizeCharacterName('Suneo'),
    ])
  })

  test('sin nombre utilizable → lista vacía', () => {
    expect(characterNameKeys(null)).toEqual([])
    expect(characterNameKeys('', [' '])).toEqual([])
  })
})

describe('nativeNameOrNull', () => {
  test('acepta un nombre nativo con escritura no latina', () => {
    expect(nativeNameOrNull(' 日向翔陽 ')).toBe('日向翔陽')
  })
  test('rechaza un nombre solo ASCII: es romaji, no kanji', () => {
    expect(nativeNameOrNull('JUN')).toBeNull()
    expect(nativeNameOrNull('Black, Jet')).toBeNull()
  })
  test('rechaza vacíos', () => {
    expect(nativeNameOrNull('  ')).toBeNull()
    expect(nativeNameOrNull(null)).toBeNull()
  })
})
