import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from 'bun:test'
import { rateGate } from '../src/core/genericManager.js'
import * as services from '../src/services/anilistMedia.js'
import {
  deepMedia,
  requests,
  resetScript,
  script,
  startAnilist,
  stopAnilist,
  task,
} from './anilistMediaBatchFixtures.js'

/** T11 (S6, L21): tope de 25 anidados en `Page` y tipos mezclados. */
const tasks = [task(1, 200_001), task(2, 200_002), task(3, 200_003)]
const fetchBatch = (list = tasks) => services.fetchAnilistMediaBatch(list)
const media = (value: unknown) =>
  (value as { media: ReturnType<typeof deepMedia> }).media

let gate: ReturnType<typeof spyOn>
beforeAll(startAnilist)
afterAll(stopAnilist)
beforeEach(() => {
  resetScript()
  gate?.mockRestore()
  gate = spyOn(rateGate, 'acquire').mockImplementation(async () => ({
    waitedMs: 0,
    sleptMs: 0,
  }))
})

describe('fetchAnilistMediaBatch · páginas y tipos', () => {
  test('más de 25 personajes o staff: se re-pide por el camino de un medio (50/página), sin saltos ni duplicados', async () => {
    script.chars = { 200_002: 60 }
    script.staff = { 200_003: 30 }
    const out = await fetchBatch()
    expect(requests.slice(1).map((r) => r.variables)).toEqual([
      { id: 200_002, type: 'ANIME', charPage: 1, staffPage: 1 },
      { id: 200_002, type: 'ANIME', charPage: 2, staffPage: 1 },
      { id: 200_002, type: 'ANIME', charPage: 3, staffPage: 1 },
      { id: 200_003, type: 'ANIME', charPage: 1, staffPage: 1 },
    ])
    expect(gate).toHaveBeenCalledTimes(4)
    expect(gate.mock.calls[0]).toEqual([
      'graphql.anilist.co|direct',
      { perSecond: 1, perMinute: 22 },
    ])
    const chars = media(out.get(2)).characters.edges.map((e) => e.node.id)
    expect(chars).toEqual(
      Array.from({ length: 60 }, (_, i) => 20_000_200 + i + 1)
    )
    const staff = media(out.get(3)).staff.edges.map((e) => e.node.id)
    expect(new Set(staff).size).toBe(30)
    expect(staff).toHaveLength(30)
    // Con ≤ 25 la página del lote basta: el medio 1 no se re-pide.
    expect(out.get(1)).toEqual({
      mediaType: 'ANIME',
      media: deepMedia(200_001),
    })
  })

  test('tipos mezclados: un Page por tipo; el segundo paga su cupo', async () => {
    const out = await fetchBatch([
      task(1, 200_001),
      task(2, 200_002, 'MANGA'),
      task(3, 200_003),
    ])
    expect(requests.map((r) => r.variables)).toEqual([
      { ids: [200_001, 200_003], type: 'ANIME' },
      { ids: [200_002], type: 'MANGA' },
    ])
    expect(gate).toHaveBeenCalledTimes(1)
    expect(out.get(2)).toEqual({
      mediaType: 'MANGA',
      media: deepMedia(200_002),
    })
  })
})
