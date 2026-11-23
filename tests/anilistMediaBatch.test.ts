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
import { FetchError } from '../src/libs/httpError.js'
import { SkippedTaskError } from '../src/libs/skippedTaskError.js'
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

/** T11 (S6, L19): N medios por request de AniList con resultado por alias. */
const tasks = [task(1, 200_001), task(2, 200_002), task(3, 200_003)]
const fetchBatch = (list = tasks) => services.fetchAnilistMediaBatch(list)
const message = (value: unknown) => (value as Error).message

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

describe('fetchAnilistMediaBatch', () => {
  test('un request con un alias por tarea; sin anilistId → skip sin pedirlo', async () => {
    const out = await fetchBatch([...tasks, task(4)])
    expect(requests).toHaveLength(1)
    expect(requests[0]?.variables).toEqual({
      i0: 200_001,
      t0: 'ANIME',
      i1: 200_002,
      t1: 'ANIME',
      i2: 200_003,
      t2: 'ANIME',
    })
    expect(requests[0]?.query).toContain('m2: Media(id: $i2, type: $t2) {')
    expect(requests[0]?.query).toContain(
      'characters(page: 1, perPage: 50, sort: [ROLE, RELEVANCE, ID])'
    )
    expect(out.get(2)).toEqual({
      mediaType: 'ANIME',
      media: deepMedia(200_002),
    })
    expect((out.get(4) as SkippedTaskError).reason).toBe('missing:anilistId')
    expect(gate).not.toHaveBeenCalled()
  })

  test('error parcial de un alias y not_found no tocan a los demás', async () => {
    Object.assign(script, {
      nulls: [200_002, 200_003],
      errors: [
        { message: 'Internal Server Error', path: ['m1'] },
        { message: 'Not Found.', path: ['m2'] },
      ],
    })
    const out = await fetchBatch([...tasks, task(5, 200_005)])
    expect(out.get(1)).toEqual({
      mediaType: 'ANIME',
      media: deepMedia(200_001),
    })
    expect(message(out.get(2))).toBe('AniList: Internal Server Error')
    expect(out.get(2)).not.toBeInstanceOf(SkippedTaskError)
    expect((out.get(3) as SkippedTaskError).reason).toBe('anilist:not_found')
    expect(out.get(5)).toEqual({
      mediaType: 'ANIME',
      media: deepMedia(200_005),
    })
  })

  test('alias null sin error → not_found (skip); error sin alias falla el grupo', async () => {
    script.nulls = [200_001]
    const out = await fetchBatch()
    expect((out.get(1) as SkippedTaskError).reason).toBe('anilist:not_found')
    expect(out.get(3)).toEqual({
      mediaType: 'ANIME',
      media: deepMedia(200_003),
    })

    resetScript()
    script.errors = [{ message: 'Max query complexity exceeded' }]
    await expect(fetchBatch()).rejects.toThrow(
      'AniList: Max query complexity exceeded'
    )
  })

  test('un 429 falla el grupo entero con el FetchError', async () => {
    script.batchStatus = 429
    const error = await fetchBatch().catch((e) => e)
    expect(error).toBeInstanceOf(FetchError)
    expect((error as FetchError).kind).toBe('rate_limit')
  })

  test('las páginas extra de personajes pasan por el gate y se suman', async () => {
    script.more = [200_002]
    const out = await fetchBatch()
    expect(requests.map((r) => r.variables)).toEqual([
      expect.objectContaining({ i0: 200_001 }),
      { id: 200_002, type: 'ANIME', charPage: 2, staffPage: 1 },
      { id: 200_002, type: 'ANIME', charPage: 3, staffPage: 1 },
    ])
    expect(gate).toHaveBeenCalledTimes(2)
    expect(gate.mock.calls[0]).toEqual([
      'graphql.anilist.co|direct',
      { perSecond: 1, perMinute: 22 },
    ])
    const media = (out.get(2) as { media: ReturnType<typeof deepMedia> }).media
    expect(media.characters.edges.map((e) => e.node.id)).toEqual([
      2_000_021, 2_000_022,
    ])
  })

  test('HTTP 404 del grupo: cada tarea por el camino de un medio, con gate', async () => {
    Object.assign(script, {
      batchStatus: 404,
      nulls: [200_002],
      errors: [{ message: 'Not Found.', path: ['m1'] }],
    })
    const out = await fetchBatch()
    expect(requests.slice(1).map((r) => r.variables.id)).toEqual([
      200_001, 200_002, 200_003,
    ])
    expect(gate).toHaveBeenCalledTimes(3)
    expect(out.get(1)).toEqual({
      mediaType: 'ANIME',
      media: deepMedia(200_001),
    })
    expect((out.get(2) as SkippedTaskError).reason).toBe('anilist:not_found')
    expect(out.get(3)).toEqual({
      mediaType: 'ANIME',
      media: deepMedia(200_003),
    })
  })
})
