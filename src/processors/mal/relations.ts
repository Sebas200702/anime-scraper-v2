import * as cheerio from 'cheerio'
import type { ScrapingTask } from '../../types/index.js'

/** Processes the MAL anime characters page. */
export const processAnimeCharacters = (rawHtml: string, task: ScrapingTask) => {
  const $ = cheerio.load(rawHtml)
  const malId = task.payload?.animeId as number

  const animeCharacters: {
    animeId: number
    characterId: number
    role: string
  }[] = []
  const characterVoiceActors: {
    characterId: number
    staffId: number
    language: string
  }[] = []

  $('table.js-anime-character-table tr').each((_, el) => {
    const characterLink = $(el).find('td:nth-child(2) > a')
    const characterHref = characterLink.attr('href')
    if (!characterHref) return

    const characterIdMatch = /character\/(\d+)/.exec(characterHref)
    const characterId = characterIdMatch
      ? Number.parseInt(characterIdMatch[1] ?? '', 10)
      : 0
    if (!characterId) return

    const role = $(el)
      .find('td:nth-child(2) .js-anime-character-type')
      .text()
      .trim()
    animeCharacters.push({ animeId: malId, characterId, role })

    $(el)
      .find('td:nth-child(3) table tr')
      .each((_, vaRow) => {
        const vaLink = $(vaRow).find('a')
        const vaHref = vaLink.attr('href')
        const language = $(vaRow).find('small').text().trim()
        if (!vaHref) return

        const staffIdMatch = /people\/(\d+)/.exec(vaHref)
        const staffId = staffIdMatch
          ? Number.parseInt(staffIdMatch[1] ?? '', 10)
          : 0
        if (staffId) {
          characterVoiceActors.push({ characterId, staffId, language })
        }
      })
  })

  return { animeCharacters, characterVoiceActors }
}

/** Processes the MAL anime staff page. */
export const processAnimeStaff = (rawHtml: string, task: ScrapingTask) => {
  const $ = cheerio.load(rawHtml)
  const malId = task.payload?.animeId as number
  const animeStaffs: { animeId: number; staffId: number; role: string }[] = []

  $('h2:contains("Staff")')
    .next('div.detail-character-list')
    .find('tr')
    .each((_, el) => {
      const staffLink = $(el).find('td:nth-child(2) a')
      const staffHref = staffLink.attr('href')
      if (!staffHref) return

      const staffIdMatch = /people\/(\d+)/.exec(staffHref)
      const staffId = staffIdMatch
        ? Number.parseInt(staffIdMatch[1] ?? '', 10)
        : 0
      if (!staffId) return

      const role = $(el).find('td:nth-child(2) small').text().trim()
      if (
        staffId &&
        role &&
        !animeStaffs.some((s) => s.staffId === staffId && s.role === role)
      ) {
        animeStaffs.push({ animeId: malId, staffId, role })
      }
    })

  return { animeStaffs }
}
