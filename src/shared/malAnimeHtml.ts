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

/**
 * Tema musical (OP/ED) de la ficha de anime de MAL.
 *
 * MAL es la fuente de canciones con **más cobertura** del catálogo (AnimeThemes
 * solo lista ~5.013 anime): la misma página que ya se descarga para personajes
 * y staff trae la tabla de openings/endings con el nº de tema, el título, el
 * artista, el rango de episodios y los enlaces de Spotify/Apple/Amazon. El id
 * `malSongId` es la clave estable de MAL para la canción (dedupe entre series).
 *
 * De aquí sale además el id de Apple Music (`appleTrackId`), que con el lookup
 * público de iTunes (sin API key) devuelve un **preview de 30 s reproducible**
 * y la carátula.
 */
export interface ParsedTheme {
  kind: 'OP' | 'ED'
  /** Nº de tema dentro de su tipo (1 = OP1/ED1). */
  sequence: number | null
  title: string
  artist: string | null
  /** Id de la canción en MAL (el de `openMusicLinkPopup`). */
  malSongId: number | null
  spotifyUrl: string | null
  appleUrl: string | null
  appleTrackId: number | null
  amazonUrl: string | null
  /** Rango de episodios tal cual lo publica MAL (`1-30`, `1-`). */
  episodes: string | null
  /** MAL tiene una página `/video` para este tema. */
  hasVideo: boolean
}

export interface ParsedMalAnime extends ParsedMalCharacters {
  themes: ParsedTheme[]
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

/** Id de canción de MAL desde el popup de la fila (`sid`). */
const songIdFromRow = ($: cheerio.CheerioAPI, $row: cheerio.Cheerio<any>) => {
  const popup = $row.find('a[href*="openMusicLinkPopup"]').attr('href') ?? ''
  const fromPopup = popup.match(/openMusicLinkPopup\('(\d+)'/)
  if (fromPopup) return Number(fromPopup[1])
  const fromInput = $row
    .find('input[id^="spotify_url_"], input[id^="apple_url_"]')
    .attr('id')
    ?.match(/_(\d+)$/)
  return fromInput ? Number(fromInput[1]) : null
}

const trackIdFromAppleUrl = (url: string | null): number | null => {
  if (!url) return null
  const id = url.match(/[?&]i=(\d+)/)?.[1]
  return id ? Number(id) : null
}

/**
 * Temas musicales (`OP`/`ED`) de la ficha de anime.
 *
 * `MAL` escribe el contenedor de openings con la errata `js-theme-songs
 * opnening` y el de endings como `... ending`, así que el tipo se decide por la
 * clase (con el `<h2>` anterior como respaldo). Dentro, cada `<tr>` trae el
 * índice, el título entrecomillado, el artista y los `input hidden` con los
 * enlaces de Spotify/Apple/Amazon.
 */
export const parseMalThemes = (html: string): ParsedTheme[] => {
  const $ = cheerio.load(html)
  const themes: ParsedTheme[] = []

  $('div.theme-songs').each((_, el) => {
    const $box = $(el)
    const heading = $box.closest('div.di-tc').find('h2').first().text().trim()
    const kind: 'OP' | 'ED' = $box.hasClass('ending')
      ? 'ED'
      : heading.toLowerCase().startsWith('ending')
        ? 'ED'
        : 'OP'

    $box.find('tr, li').each((__, row) => {
      const $row = $(row)
      // Layout A: el título va en su propio `<span class="theme-song-title">`.
      // Layout B: el título es texto plano dentro de la celda, entre el
      // índice y el artista (así vienen las series largas: One Piece tenía 86
      // OP/ED y, sin este segundo layout, no se parseaba ninguno).
      const $titleSpan = $row.find('.theme-song-title').first()
      let title = $titleSpan.text().trim()
      if (!title) {
        const $clone = $row.find('td').eq(1).clone()
        $clone
          .find(
            '.theme-song-index, .theme-song-artist, .theme-song-episode, input, a, script'
          )
          .remove()
        title = $clone.text().trim()
      }
      if (!title) return // filas de encabezado o temas sin datos en MAL
      title = title.replace(/^"|"$/g, '').trim()
      if (!title) return

      const rawArtist = $row.find('.theme-song-artist').text().trim()
      const artist = rawArtist.replace(/^by\s+/i, '').trim() || null
      const episodes =
        $row
          .find('.theme-song-episode')
          .text()
          .trim()
          .replace(/^\(|\)$/g, '') || null
      const sequence = Number.parseInt(
        $row.find('.theme-song-index').text().replace(/\D/g, ''),
        10
      )
      const spotifyUrl =
        $row.find('input[id^="spotify_url_"]').attr('value')?.trim() || null
      const appleUrl =
        $row.find('input[id^="apple_url_"]').attr('value')?.trim() || null
      const amazonUrl =
        $row.find('input[id^="amazon_url_"]').attr('value')?.trim() || null

      themes.push({
        kind,
        sequence: Number.isFinite(sequence) ? sequence : null,
        title,
        artist,
        malSongId: songIdFromRow($, $row),
        spotifyUrl,
        appleUrl,
        appleTrackId: trackIdFromAppleUrl(appleUrl),
        amazonUrl,
        episodes,
        hasVideo: $row.find('a[href$="/video"]').length > 0,
      })
    })
  })

  return themes
}

/**
 * `Favorites` (miembros que marcaron el anime como favorito) de la barra
 * lateral de MAL.
 *
 * La API oficial **no** expone este dato (solo `num_list_users` = members), y
 * la app lo publica en el detalle del anime (`anime.favourites`), así que sale
 * de la ficha HTML: `Popularity: #9  Members: 3,170,632  Favorites: 88,028`.
 */
export const parseMalFavorites = (html: string): number | null => {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const match = text.match(/Favorites:\s*([0-9][0-9,]*)/)
  if (!match?.[1]) return null
  const value = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}

/** Personajes, staff y temas musicales de una ficha de anime. */
export const parseMalAnimePage = (html: string): ParsedMalAnime => ({
  ...parseMalAnimeCharacters(html),
  themes: parseMalThemes(html),
})
