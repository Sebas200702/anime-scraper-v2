/**
 * Parser del HTML de la ficha de anime de MyAnimeList (`/anime/{id}`).
 *
 * Es la **única** vía a personajes, seiyuus y staff con ids MAL: la API oficial
 * v2 ignora `characters`/`staff` (verificado: devuelve 200 sin esos campos) y
 * AniList/Kitsu no exponen `idMal` para personajes. Con gzip la página pesa
 * ~35-48 KB, así que las ~30.5k fichas caben en el trial (~1.1 GB).
 *
 * Estructura observada:
 * - Personajes: `h3.h3_characters_voice_actors` con el link `/character/{id}/`.
 *   El rol va en el `<small>` de la misma celda y el seiyuu en la celda
 *   siguiente (`td.va-t`), con su idioma en otro `<small>`.
 * - Staff: tras `<h2>Staff</h2>`, filas con `/people/{id}/` y `<small>` de rol.
 */
import * as cheerio from 'cheerio'

export interface ParsedCharacter {
  malId: number
  name: string
  image?: string
  role: string
  voiceActors: {
    malId: number
    name: string
    language: string
    image?: string
  }[]
}

export interface ParsedStaff {
  malId: number
  name: string
  image?: string
  roles: string[]
}

export interface ParsedMalCharacters {
  animeCharacters: ParsedCharacter[]
  animeStaff: ParsedStaff[]
}

const idFromHref = (href: string | undefined, kind: string): number | null => {
  const m = href?.match(new RegExp(`/${kind}/(\\d+)`))
  return m ? Number(m[1]) : null
}

/** URL de imagen de MAL: se quita el prefijo de reescalado (`/r/42x62`). */
const fullImage = (src: string | undefined): string | undefined => {
  if (!src) return undefined
  const stripped = src.replace(/\/r\/\d+x\d+/, '')
  return stripped.startsWith('http') ? stripped : undefined
}

export const parseMalAnimeCharacters = (html: string): ParsedMalCharacters => {
  const $ = cheerio.load(html)
  const animeCharacters: ParsedCharacter[] = []
  const animeStaff: ParsedStaff[] = []

  // --- Personajes + seiyuus ---
  $('h3.h3_characters_voice_actors').each((_, el) => {
    const $h3 = $(el)
    const href = $h3.find('a').attr('href')
    const malId = idFromHref(href, 'character')
    if (!malId) return

    const $cell = $h3.closest('td')
    const name = $h3.find('a').text().trim()
    const role = $cell.find('small').first().text().trim() || 'Unknown'
    const image = fullImage(
      $cell.prev('td').find('img').attr('data-src') ??
        $cell.prev('td').find('img').attr('src')
    )

    // El seiyuu vive en la celda siguiente, que puede tener varios (varios
    // idiomas). MAL reparte el nombre+idioma en una celda y la imagen en la
    // siguiente: se dedupe por id y se fusiona la imagen.
    const voiceActors: ParsedCharacter['voiceActors'] = []
    $cell.nextAll('td').each((__, vael) => {
      const $va = $(vael)
      const vaHref = $va.find('a[href*="/people/"]').first().attr('href')
      const vaId = idFromHref(vaHref, 'people')
      if (!vaId) return
      const vaName = $va.find('a[href*="/people/"]').first().text().trim()
      const vaImage = fullImage(
        $va.find('img').attr('data-src') ?? $va.find('img').attr('src')
      )

      const existing = voiceActors.find((v) => v.malId === vaId)
      if (existing) {
        if (!existing.image && vaImage) existing.image = vaImage
        return
      }
      voiceActors.push({
        malId: vaId,
        name: vaName,
        language: $va.find('small').first().text().trim() || 'Japanese',
        ...(vaImage ? { image: vaImage } : {}),
      })
    })

    animeCharacters.push({
      malId,
      name,
      ...(image ? { image } : {}),
      role,
      voiceActors,
    })
  })

  // --- Staff ---
  // Cada persona es su propia `<table><tr>`: la imagen va en la primera celda
  // (ancla sin texto) y el nombre+rol en la segunda. Se recorre por filas, no
  // por anclas, o se toma la ancla de la imagen y la fila se descarta.
  $('h2')
    .filter((_, el) => $(el).text().trim() === 'Staff')
    .each((_, el) => {
      const $section = $(el).parent().next('div.detail-characters-list')
      $section.find('tr').each((__, row) => {
        const $row = $(row)
        const $name = $row
          .find('a[href*="/people/"]')
          .filter((___, a) => $(a).text().trim().length > 0)
          .first()
        const malId = idFromHref($name.attr('href'), 'people')
        const name = $name.text().trim()
        if (!malId || !name) return

        const role = $row.find('small').first().text().trim() || 'Unknown'
        const image = fullImage(
          $row.find('img').attr('data-src') ?? $row.find('img').attr('src')
        )

        const existing = animeStaff.find((s) => s.malId === malId)
        if (existing) {
          if (!existing.roles.includes(role)) existing.roles.push(role)
          if (!existing.image && image) existing.image = image
          return
        }
        animeStaff.push({
          malId,
          name,
          ...(image ? { image } : {}),
          roles: [role],
        })
      })
    })

  return { animeCharacters, animeStaff }
}
