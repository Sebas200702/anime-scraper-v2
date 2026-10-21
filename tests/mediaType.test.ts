import { describe, expect, test } from 'bun:test'
import { normalizeMediaType } from '../src/shared/mediaType.js'
import { processTvdbSeriesArtworks } from '../src/processors/tvdbSeriesArtworks.js'
import type { ScrapingTask } from '../src/types/index.js'

describe('normalizeMediaType (vocabulario de anidev)', () => {
  test('acepta los valores canónicos en cualquier casing', () => {
    expect(normalizeMediaType('Banner')).toBe('banner')
    expect(normalizeMediaType('ClearLogo')).toBe('clearlogo')
    expect(normalizeMediaType(' poster ')).toBe('poster')
  })

  test('mapea alias del proveedor', () => {
    expect(normalizeMediaType('Fanart')).toBe('background')
    expect(normalizeMediaType('Clear Logo')).toBe('clearlogo')
  })

  test('descarta lo que el catálogo no modela', () => {
    expect(normalizeMediaType('Poster (Season)')).toBeNull()
    expect(normalizeMediaType('7')).toBeNull()
    expect(normalizeMediaType('')).toBeNull()
  })
})

describe('processTvdbSeriesArtworks normaliza y filtra', () => {
  const task = {
    payload: { anime_id: 1, type: 'series' },
  } as unknown as ScrapingTask

  test('escribe solo tipos canónicos', () => {
    const result = processTvdbSeriesArtworks(
      {
        data: {
          artworks: [
            { type: 1, image: 'https://x/banner.jpg' }, // Banner
            { type: 2, image: 'https://x/poster.jpg' }, // Poster
            { type: 999, image: 'https://x/unknown.jpg' }, // id sin nombre conocido
          ],
        },
      } as never,
      task
    )

    const artworks = (
      result as { artworks: { mediaType: string; src: string }[] }
    ).artworks
    expect(artworks).toHaveLength(2) // el 999 se descarta
    expect(artworks.map((a) => a.mediaType).sort()).toEqual([
      'banner',
      'poster',
    ])
    expect(artworks.some((a) => a.src.includes('unknown'))).toBe(false)
  })
})
