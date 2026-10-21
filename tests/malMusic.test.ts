import { describe, expect, test } from 'bun:test'
import { normalizeSongTitle } from '../src/shared/malMusicIds.js'
import { streamsOfTheme } from '../src/processors/malHtml.js'

/**
 * El merge MAL↔AnimeThemes depende de esta clave: si dos fuentes titulan
 * distinto el mismo tema, se duplican las canciones (y con ellas la lista del
 * anime). Estas son cadenas reales de la ficha de Naruto Shippuuden (MAL) y de
 * AnimeThemes.
 */
describe('normalizeSongTitle (clave de merge MAL ↔ AnimeThemes)', () => {
  test('ignora el título japonés entre paréntesis y los espacios', () => {
    expect(
      normalizeSongTitle(
        'Nagare Boshi ~Shooting Star~ (流れ星〜Shooting Star〜)'
      )
    ).toBe(normalizeSongTitle('Nagareboshi ~Shooting Star~'))
  })

  test.each([
    ['Michi ~to you all (道 〜to you all)', 'Michi ~ To You All'],
    ['KIMI MONOGATARI (キミモノガタリ)', 'Kimi Monogatari'],
    ['Sunao na Niji (素直な虹)', 'Sunao Na Niji'],
    ['Hero\u0027s Come Back', "Hero's Come Back"],
  ])('%s == %s', (a, b) => {
    expect(normalizeSongTitle(a)).toBe(normalizeSongTitle(b))
  })

  test('no confunde canciones distintas', () => {
    expect(normalizeSongTitle('Distance')).not.toBe(
      normalizeSongTitle('Long Kiss Good Bye')
    )
  })

  test('recorta variantes entre paréntesis (TV Size / Movie Ver.)', () => {
    expect(normalizeSongTitle('Silhouette (TV Size)')).toBe(
      normalizeSongTitle('Silhouette')
    )
  })

  test('sin título no revienta', () => {
    expect(normalizeSongTitle(null)).toBe('')
    expect(normalizeSongTitle(undefined)).toBe('')
  })
})

describe('streamsOfTheme (enlaces de tienda de MAL)', () => {
  test('normaliza proveedor, id externo y storefront', () => {
    expect(
      streamsOfTheme({
        spotifyUrl: 'https://open.spotify.com/track/7weHG0yOwtAcZ0qBhyODLF',
        appleUrl:
          'https://music.apple.com/jp/album/heros-come-back/1536898528?i=1536898529',
        amazonUrl: 'https://music.amazon.co.jp/search/Hero',
      })
    ).toEqual([
      {
        provider: 'spotify',
        url: 'https://open.spotify.com/track/7weHG0yOwtAcZ0qBhyODLF',
        externalId: '7weHG0yOwtAcZ0qBhyODLF',
        country: null,
      },
      {
        provider: 'apple',
        url: 'https://music.apple.com/jp/album/heros-come-back/1536898528?i=1536898529',
        externalId: '1536898529',
        country: 'jp',
      },
      {
        provider: 'amazon',
        url: 'https://music.amazon.co.jp/search/Hero',
        externalId: null,
        country: 'jp',
      },
    ])
  })

  test('sin enlaces no inventa filas', () => {
    expect(
      streamsOfTheme({ spotifyUrl: null, appleUrl: null, amazonUrl: null })
    ).toEqual([])
  })
})
