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

/** T11 (S6, L21): N medios por request con `Page { media(id_in:) }`. */
const tasks = [task(1, 200_001), task(2, 200_002), task(3, 200_003)]
const fetchBatch = (list = tasks) => services.fetchAnilistMediaBatch(list)
const reason = (value: unknown) => (value as SkippedTaskError).reason

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
  test('un request Page/id_in, mapeado por id; sin anilistId → skip sin pedirlo', async () => {
    const out = await fetchBatch([...tasks, task(4)])
    expect(requests).toHaveLength(1)
    expect(requests[0]?.variables).toEqual({
      ids: [200_001, 200_002, 200_003],
      type: 'ANIME',
    })
    expect(requests[0]?.query).toContain('Page(perPage: 3) {')
    expect(requests[0]?.query).toContain('media(id_in: $ids, type: $type) {')
    expect(requests[0]?.query).toContain(
      'characters(page: 1, perPage: 50, sort: [ROLE, RELEVANCE, ID])'
    )
    expect(requests[0]?.query).not.toContain('m0:')
    // El simulador devuelve `media` en orden inverso: el mapeo es por id.
    expect(out.get(1)).toEqual({
      mediaType: 'ANIME',
      media: deepMedia(200_001),
    })
    expect(out.get(3)).toEqual({
      mediaType: 'ANIME',
      media: deepMedia(200_003),
    })
    expect(reason(out.get(4))).toBe('missing:anilistId')
    expect(gate).not.toHaveBeenCalled()
  })

  test('un id ausente de media es skip (not_found) solo para su tarea', async () => {
    script.missing = [200_002]
    const out = await fetchBatch()
    expect(requests).toHaveLength(1)
    expect(reason(out.get(2))).toBe('anilist:not_found')
    expect(out.get(1)).toEqual({
      mediaType: 'ANIME',
      media: deepMedia(200_001),
    })
    expect(out.get(3)).toEqual({
      mediaType: 'ANIME',
      media: deepMedia(200_003),
    })
  })

  test('error con ruta a un medio: solo esa tarea; sin datos o sin ruta: falla el grupo', async () => {
    // `media` llega invertido: índice 0 = 200_003.
    script.errors = [
      { message: 'Internal Server Error', path: ['Page', 'media', 0, 'staff'] },
    ]
    const out = await fetchBatch()
    expect((out.get(3) as Error).message).toBe('AniList: Internal Server Error')
    expect(out.get(1)).toEqual({
      mediaType: 'ANIME',
      media: deepMedia(200_001),
    })

    resetScript()
    Object.assign(script, {
      noData: true,
      errors: [{ message: 'Max query complexity should be 500 but got 590.' }],
    })
    await expect(fetchBatch()).rejects.toThrow(
      'AniList: Max query complexity should be 500 but got 590.'
    )

    resetScript()
    script.errors = [{ message: 'Something odd' }]
    await expect(fetchBatch()).rejects.toThrow('AniList: Something odd')
  })

  test('HTTP 429 o 503 falla el grupo entero con el FetchError (400/404 caen a un medio)', async () => {
    for (const [status, kind] of [
      [429, 'rate_limit'],
      [503, 'transient'],
    ] as const) {
      resetScript()
      script.batchStatus = status
      const error = await fetchBatch().catch((e) => e)
      expect(error).toBeInstanceOf(FetchError)
      expect((error as FetchError).kind).toBe(kind)
    }
  })
})
