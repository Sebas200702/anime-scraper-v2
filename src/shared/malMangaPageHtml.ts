/**
 * Parser de la página de una obra impresa de MAL (`/manga/{id}`).
 *
 * La API v2 de MAL **no** expone los autores ni los artistas de un manga
 * (su `/v2/manga/{id}` no tiene el campo de staff ✗) y AniList los da con
 * nombres parciales ("Yaminabe") o de seudónimo ("Ray Yuuki" frente al real
 * "Kaneko, Yuuki" ✗), así que no se pueden cruzar. La página web sí publica
 * el **id de persona** de MAL, que es el que necesita el catálogo.
 *
 * Marcado de la sección de autores:
 *
 * ```html
 * <div class="spaceit_pad">
 *   <span class="dark_text">Authors:</span>
 *   <a href="/people/1867/Naoki_Urasawa">Urasawa, Naoki</a> (Story &amp; Art)
 * </div>
 * ```
 */
import * as cheerio from 'cheerio'

export interface ParsedMangaStaff {
  /** Id de MAL de la persona (espacio de personas). */
  malId: number
  name: string
  /** Rol tal cual lo publica MAL ("Story", "Art", "Story & Art"). */
  roles: string[]
}

const ROLE_LABELS: Record<string, string> = {
  authors: 'Authors',
  artists: 'Artists',
  'story & art': 'Story & Art',
  story: 'Story',
  art: 'Art',
  illustration: 'Illustration',
  editor: 'Editor',
  assistant: 'Assistant',
  publisher: 'Publisher',
  writer: 'Writer',
  original: 'Original Creator',
}

/**
 * Extrae el equipo de una obra impresa de MAL.
 *
 * @param html - HTML de `/manga/{id}`
 * @returns Una entrada por persona y rol (una persona con dos roles aparece dos veces)
 */
export const parseMalMangaPage = (html: string): ParsedMangaStaff[] => {
  const $ = cheerio.load(html)
  const out: ParsedMangaStaff[] = []

  $('div.spaceit_pad').each((_, el) => {
    const $el = $(el)
    const label = $el.find('span.dark_text').first().text().trim()
    if (!label.endsWith(':')) return
    const key = label.slice(0, -1).trim().toLowerCase()
    if (!(key in ROLE_LABELS)) return

    // Los roles van entre paréntesis: "(Story & Art)".
    const inParens = $el.text().match(/\(([^)]*)\)/)?.[1]?.trim()
    const rolesRaw = inParens ?? ''
    const roles = rolesRaw
      ? rolesRaw
          .split('&')
          .map((r) => r.trim())
          .filter(Boolean)
      : [ROLE_LABELS[key] as string]

    $el.find('a[href*="/people/"]').each((__, a) => {
      const $a = $(a)
      const href = $a.attr('href')
      const id = href?.match(/\/people\/(\d+)/)?.[1]
      const name = $a.text().trim()
      if (!id || !name) return
      for (const role of roles) {
        out.push({ malId: Number(id), name, roles: [role] })
      }
    })
  })

  // Una persona con varios roles: se separa en varias entradas (una por rol).
  return out
}
