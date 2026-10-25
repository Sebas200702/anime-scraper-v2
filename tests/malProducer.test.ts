import { describe, expect, test } from 'bun:test'
import type { ScrapingTask } from '../src/types/index.js'
import { processMalProducer } from '../src/processors/malProducer.js'

const task = {
  entityId: 'producer_logo_14',
  taskType: 'producer_logo_hydration',
} as ScrapingTask

const page = (ogImage: string, info: string) => `<html><head>
<meta property="og:image" content="${ogImage}">
</head><body>
<div class="mb16">
  <div class="spaceit_pad"><span class="dark_text">Japanese:</span> サンライズ</div>
  ${info}
  <div class="spaceit_pad"><span class="dark_text">Member Favorites:</span> 8,524</div>
  <div class="spaceit_pad"><span>Sunrise is an animation production brand of Bandai Namco Filmworks.<br /><br />It has operated with its current name since 1987 and produces many TV series and films.</span></div>
</div>
</body></html>`

describe('processMalProducer (logo desde MAL)', () => {
  test('extrae logo, fundación y descripción', () => {
    const result = processMalProducer(
      {
        producerId: 14,
        html: page(
          'https://cdn.myanimelist.net/s/common/company_logos/abc_600x600_i?s=1',
          '<div class="spaceit_pad"><span class="dark_text">Established:</span> Nov, 1976</div>'
        ),
      },
      task
    )

    expect(result).toEqual({
      producerId: 14,
      logo: 'https://cdn.myanimelist.net/s/common/company_logos/abc_600x600_i?s=1',
      established: 'Nov, 1976',
      about:
        'Sunrise is an animation production brand of Bandai Namco Filmworks. It has operated with its current name since 1987 and produces many TV series and films.',
    })
  })

  test('sin logo real (og:image por defecto) no inventa media', () => {
    const result = processMalProducer(
      {
        producerId: 99,
        html: page(
          'https://cdn.myanimelist.net/img/sp/icon/apple-touch-icon-256.png',
          '<div class="spaceit_pad"><span class="dark_text">Established:</span> Unknown</div>'
        ),
      },
      task
    )

    expect(result.logo).toBeNull()
    expect(result.established).toBe('Unknown')
  })
})
