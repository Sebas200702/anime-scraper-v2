/**
 * Parser de la enciclopedia de Anime News Network (`/encyclopedia/anime.php?id=`).
 *
 * ANN publica los **OP/ED con nº de tema, título, artista y rango de
 * episodios**:
 *
 *   Opening Theme:
 *   "Rise" by Jeremy Sweet and Ian Nickus [English Version] (eps 1-52)
 *   #01: "Rocks" by Hound Dog (eps 1-25)
 *   #02: "Haruka Kanata (遥か彼方)" by Asian Kung-Fu Generation (eps 26-53)
 *
 * Es el complemento que faltaba: MAL da el listado de OP/ED pero no siempre el
 * nº ni el rango, y AnimeThemes solo tiene 5.013 animes. El dump offline trae
 * el id de ANN de 12.619 animes, así que el emparejamiento es exacto (lo
 * curó el proyecto manami) y no hace falta ninguna búsqueda por título.
 */
import * as cheerio from 'cheerio'

export interface ParsedAnnTheme {
  kind: 'OP' | 'ED'
  /** Nº de tema (`#01` → 1). `null` en la entrada sin numerar. */
  sequence: number | null
  title: string
  artist: string | null
  /** Variante (`[English Version]`). */
  variant: string | null
  /** Rango de episodios tal cual lo publica ANN (`1-25`, `13-`). */
  episodes: string | null
}

/** `"Title" by Artist [Variant] (eps 1-25)` (con `#01:` opcional delante). */
const THEME_LINE =
  /^(?:#(\d+):\s*)?"(.+?)"(?:\s+by\s+(.+?))?(?:\s*\[([^\]]+)\])?(?:\s*\(eps?\s*([^)]*)\))?$/

export const parseAnnThemes = (html: string): ParsedAnnTheme[] => {
  const $ = cheerio.load(html)
  const out: ParsedAnnTheme[] = []

  $('div.encyc-info-type').each((_, el) => {
    const $box = $(el)
    const label = $box
      .find('strong')
      .first()
      .text()
      .trim()
      .replace(/:$/, '')
      .toLowerCase()
    if (label !== 'opening theme' && label !== 'ending theme') return
    const kind: 'OP' | 'ED' = label === 'opening theme' ? 'OP' : 'ED'

    $box.find('div.tab').each((__, tab) => {
      const text = $(tab).text().trim()
      if (!text) return
      const match = text.match(THEME_LINE)
      if (!match) return
      const [, seq, title, artist, variant, episodes] = match
      if (!title) return
      out.push({
        kind,
        sequence: seq ? Number(seq) : null,
        title: title.trim(),
        artist: artist?.trim() || null,
        variant: variant?.trim() || null,
        episodes: episodes?.trim() || null,
      })
    })
  })

  return out
}

/**
 * Ids externos que publica ANN (MAL, AniList, IMDb…). Sirven para **verificar**
 * que la ficha corresponde al anime esperado: si el `idMal` de la página no
 * coincide con el nuestro, la ficha es de otro anime y se descarta.
 */
export const parseAnnExternalIds = (
  html: string
): { malId: number | null; anilistId: number | null } => {
  const $ = cheerio.load(html)
  const text = $('body').text()
  const mal = text.match(/MyAnimeList\s*:\s*(\d+)/i)
  const anilist = text.match(/AniList\s*:\s*(\d+)/i)
  const malLink = html.match(/myanimelist\.net\/anime\/(\d+)/i)
  return {
    malId: mal ? Number(mal[1]) : malLink ? Number(malLink[1]) : null,
    anilistId: anilist ? Number(anilist[1]) : null,
  }
}
