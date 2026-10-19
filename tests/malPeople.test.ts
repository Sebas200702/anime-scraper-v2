import { describe, expect, test } from 'bun:test'
import { processMalPeople } from '../src/processors/malPeople.js'
import type { ScrapingTask } from '../src/types/index.js'

const task = { payload: { staffId: 82 } } as unknown as ScrapingTask

describe('processMalPeople (ficha de persona de MAL)', () => {
  test('saca el retrato del og:image (URL completa)', () => {
    const html = `<html><head>
      <meta property="og:image" content="https://cdn.myanimelist.net/images/voiceactors/1/54602.jpg">
    </head></html>`
    expect(processMalPeople({ html, staffId: 82 }, task)).toEqual({
      staffMedia: [
        {
          entityId: 82,
          src: 'https://cdn.myanimelist.net/images/voiceactors/1/54602.jpg',
          mediaType: 'poster',
        },
      ],
    })
  })

  test('sin og:image no inventa filas', () => {
    expect(processMalPeople({ html: '<html></html>', staffId: 1 }, task)).toEqual({
      staffMedia: [],
    })
  })
})
