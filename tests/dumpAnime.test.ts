import { describe, expect, test } from 'bun:test'
import { parseDumpEntry } from '../src/shared/dumpAnime.js'

const entry = (over: Record<string, unknown> = {}) => ({
  sources: [
    'https://anilist.co/anime/142051',
    'https://kitsu.app/anime/47450',
    'https://myanimelist.net/anime/51478',
  ],
  title: '!NVADE SHOW!',
  type: 'SPECIAL',
  episodes: 1,
  status: 'FINISHED',
  animeSeason: { season: 'FALL', year: 2020 },
  synonyms: ['!nvade Show!', '!NVADE SHOW!', ''],
  ...over,
})

describe('parseDumpEntry (seed offline sin Jikan)', () => {
  test('extrae los tres ids y normaliza al vocabulario Jikan', () => {
    expect(parseDumpEntry(entry())).toEqual({
      malId: 51478,
      anilistId: 142051,
      kitsuId: 47450,
      title: '!NVADE SHOW!',
      type: 'Special',
      status: 'Finished Airing',
      episodes: 1,
      year: 2020,
      season: 'fall',
      synonyms: ['!nvade Show!'],
    })
  })

  test('sin mal_id no hay fila posible', () => {
    expect(
      parseDumpEntry(entry({ sources: ['https://anilist.co/anime/1'] }))
    ).toBeNull()
    expect(parseDumpEntry(entry({ title: '' }))).toBeNull()
  })

  test('mapea todos los vocabularios medidos del dump', () => {
    expect(parseDumpEntry(entry({ type: 'TV' }))?.type).toBe('TV')
    expect(parseDumpEntry(entry({ type: 'MOVIE' }))?.type).toBe('Movie')
    expect(parseDumpEntry(entry({ type: 'OVA' }))?.type).toBe('OVA')
    expect(parseDumpEntry(entry({ type: 'ONA' }))?.type).toBe('ONA')
    expect(parseDumpEntry(entry({ type: 'UNKNOWN' }))?.type).toBeNull()
    expect(parseDumpEntry(entry({ status: 'ONGOING' }))?.status).toBe(
      'Currently Airing'
    )
    expect(parseDumpEntry(entry({ status: 'UPCOMING' }))?.status).toBe(
      'Not yet aired'
    )
    expect(
      parseDumpEntry(entry({ animeSeason: { season: 'UNDEFINED' } }))?.season
    ).toBeNull()
    expect(parseDumpEntry(entry({ episodes: 0 }))?.episodes).toBeNull()
  })
})
