import * as cheerio from 'cheerio'
import type { ScrapingTask, AnimeProcessorResult, NewAnime } from '../../types/index.js'
import { parseNumber, parseYear } from '../../shared/parsers.js'

/**
 * Processes the main MAL anime page HTML for core details.
 */
export const processAnime = (
  rawHtml: string,
  task: ScrapingTask
): AnimeProcessorResult => {
  const $ = cheerio.load(rawHtml)
  const malId = task.payload?.animeId as number

  const getSidebarInfo = (label: string): string | null => {
    const element = $(`.spaceit_pad:contains("${label}")`)
    if (!element.length) return null
    const parentClone = element.clone()
    parentClone.find('span.dark_text').remove()
    const value = parentClone.text().trim()
    return ['N/A', 'Unknown', ''].includes(value) ? null : value
  }

  const getScore = () => parseNumber($('span[itemprop="ratingValue"]').text())
  const getScoredBy = () =>
    parseNumber($('span[itemprop="ratingCount"]').text())

  const backgroundHeader = $('h2:contains("Background")')
  const background = backgroundHeader.length
    ? backgroundHeader.nextUntil('h2').text().trim()
    : null

  const anime: NewAnime = {
    malId,
    title: $('h1.title-name').text().trim(),
    titleEnglish: getSidebarInfo('English:'),
    titleJapanese: getSidebarInfo('Japanese:'),
    type: getSidebarInfo('Type:'),
    status: getSidebarInfo('Status:'),
    episodes: parseNumber(getSidebarInfo('Episodes:')),
    score: getScore(),
    scoredBy: getScoredBy(),
    popularityRank: parseNumber(getSidebarInfo('Popularity:')),
    rating: getSidebarInfo('Rating:'),
    synopsis: $('p[itemprop="description"]').text().trim() || null,
    year: parseYear(getSidebarInfo('Aired:')),
    season: getSidebarInfo('Premiered:'),
    background,
  }

  const titleSynonyms = (getSidebarInfo('Synonyms:') || '')
    .split(',')
    .map((title) => ({ animeId: malId, title: title.trim() }))
    .filter((s) => s.title)

  const genres: { malId: number; name: string }[] = []
  const demographics: { malId: number; name: string }[] = []
  const themes: { malId: number; name: string }[] = []

  $('span[itemprop="genre"]').each((_, el) => {
    const name = $(el).text().trim()
    const href = $(el).attr('href') || ''
    const idMatch = /\/(\d+)\//.exec(href)
    const genreId = idMatch ? Number.parseInt(idMatch[1] ?? '', 10) : 0
    if (genreId > 0 && name) {
      if (href.includes('/demographic/'))
        demographics.push({ malId: genreId, name })
      else if (href.includes('/theme/')) themes.push({ malId: genreId, name })
      else if (href.includes('/genre/')) genres.push({ malId: genreId, name })
    }
  })

  const producers: { malId: number; name: string }[] = []
  $(
    '.spaceit_pad:contains("Producers:"), .spaceit_pad:contains("Licensors:"), .spaceit_pad:contains("Studios:")'
  )
    .find('a')
    .each((_, link) => {
      const name = $(link).text().trim()
      const href = $(link).attr('href')
      const idMatch = href?.match(/producer\/(\d+)/)
      const producerId = idMatch ? Number.parseInt(idMatch[1] ?? '', 10) : 0
      if (
        producerId > 0 &&
        name &&
        !producers.some((p) => p.malId === producerId)
      ) {
        producers.push({ malId: producerId, name })
      }
    })

  const posterSrc =
    $('img[itemprop="image"]').attr('data-src') ||
    $('img[itemprop="image"]').attr('src')
  const animeMedias = posterSrc
    ? [{ entityId: malId, entityType: 'anime', mediaType: 'poster', src: posterSrc, size: null }]
    : []

  return { anime, titleSynonyms, genres, demographics, themes, animeMedias }
}
