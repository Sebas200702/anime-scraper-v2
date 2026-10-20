/**
 * Parser de la página de personajes de MAL (`/anime/{id}/characters`).
 *
 * La ficha principal del anime solo lista los **diez primeros** personajes;
 * esta página trae la lista **entera** con el nombre, el rol, los favoritos,
 * el retrato y las voces (con su idioma). Es la única fuente que da el reparto
 * completo de MAL junto con los ids correctos.
 *
 * Marcado (por fila de `table.js-anime-character-table`):
 *
 * ```html
 * <tr>
 *   <td> <a href="/character/3/Jet_Black"><img data-src="https://cdn…/r/42x62/images/characters/11/253723.jpg?s=…"></a> </td>
 *   <td>
 *     <div class="js-chara-roll-and-name" style="display:none">m_Black, Jet</div>
 *     <div class="js-anime-character-favorites" style="display:none;">2321</div>
 *     <div class="spaceit_pad"><a href="/character/3/Jet_Black"><h3 class="h3_character_name">Black, Jet</h3></a></div>
 *     <div class="spaceit_pad">Main</div>
 *     <div class="spaceit_pad" style="color:#787878;">2,321 Favorites</div>
 *   </td>
 *   <td><table class="js-anime-character-va">
 *     <tr class="js-anime-character-va-lang">
 *       <td><div class="spaceit_pad"><a href="/people/357/Unshou_Ishizuka">Ishizuka, Unshou</a></div>
 *           <div class="spaceit_pad js-anime-character-language">Japanese</div></td>
 *       <td><a href="/people/357/Unshou_Ishizuka"><img data-src="…/voiceactors/2/17135.jpg"></a></td>
 *     </tr>
 *   </table></td>
 * </tr>
 * ```
 */
import * as cheerio from 'cheerio'

export interface ParsedCharacterRow {
  /** Id de MAL del personaje (espacio de personajes, no de personas). */
  malId: number
  name: string
  /** Nombre nativo (japonés) cuando MAL lo publica. */
  nativeName: string | null
  role: string
  favourites: number | null
  image?: string
  voiceActors: {
    malId: number
    name: string
    language: string
    image?: string
  }[]
}

const idFromHref = (href: string | undefined, kind: string): number | null => {
  const m = href?.match(new RegExp(`/${kind}/(\\d+)`))
  return m ? Number(m[1]) : null
}

/** URL de imagen de MAL: se quita el prefijo de reescalado (`/r/42x62`) y la firma. */
const fullImage = (src: string | undefined): string | undefined => {
  if (!src) return undefined
  const stripped: string = src.replace(/\/r\/\d+x\d+/, '').split('?')[0] ?? ''
  return stripped.startsWith('http') ? stripped : undefined
}

/**
 * Extrae el reparto completo de la página de personajes de un anime.
 *
 * @param html - HTML de `/anime/{id}/characters`
 * @returns Una fila por personaje, con su rol, favoritos, retrato y voces
 */
export const parseMalCharactersPage = (html: string): ParsedCharacterRow[] => {
  const $ = cheerio.load(html)
  const characters: ParsedCharacterRow[] = []

  $('table.js-anime-character-table tr').each((_, row) => {
    const $row = $(row)
    const $cells = $row.children('td')
    if ($cells.length < 2) return

    const $info = $cells.eq(1)
    const $nameEl = $info.find('h3.h3_character_name').first()
    const name = $nameEl.text().trim()
    if (!name) return

    const href =
      $nameEl.find('a').attr('href') ?? $nameEl.parent('a').attr('href')
    const malId = idFromHref(href, 'character')
    if (!malId) return

    // El rol es el `div.spaceit_pad` que no contiene el nombre ni los
    // favoritos; el nombre nativo va en un div oculto con prefijo `m_`.
    const role =
      $info
        .find('div.spaceit_pad')
        .filter((__, el) => {
          const $el = $(el)
          return (
            $el.find('h3.h3_character_name').length === 0 &&
            $el.find('div.js-anime-character-favorites').length === 0 &&
            !/Favorites/.test($el.text())
          )
        })
        .first()
        .text()
        .replace(/&nbsp;/g, ' ')
        .trim() || 'Unknown'

    const nativeRaw = $info
      .find('div.js-chara-roll-and-name')
      .first()
      .text()
      .trim()
    const nativeName = nativeRaw.startsWith('m_') ? nativeRaw.slice(2) : null

    const favouritesRaw = $info
      .find('div.js-anime-character-favorites')
      .first()
      .text()
      .replace(/[^\d]/g, '')
    const favourites = favouritesRaw ? Number(favouritesRaw) : null

    const image = fullImage(
      $cells.eq(0).find('img').attr('data-src') ??
        $cells.eq(0).find('img').attr('src')
    )

    // Las voces: una fila por idioma dentro de la tabla del actor.
    const voiceActors: ParsedCharacterRow['voiceActors'] = []
    $row
      .find('table.js-anime-character-va tr.js-anime-character-va-lang')
      .each((__, vaRow) => {
        const $vaRow = $(vaRow)
        const $va = $vaRow.find('a[href*="/people/"]').first()
        const vaId = idFromHref($va.attr('href'), 'people')
        const vaName = $va.text().trim()
        if (!vaId || !vaName) return
        const language =
          $vaRow.find('.js-anime-character-language').first().text().trim() ||
          'Japanese'
        const vaImage = fullImage(
          $vaRow.find('img').attr('data-src') ?? $vaRow.find('img').attr('src')
        )
        if (
          voiceActors.some((v) => v.malId === vaId && v.language === language)
        ) {
          return
        }
        voiceActors.push({
          malId: vaId,
          name: vaName,
          language,
          ...(vaImage ? { image: vaImage } : {}),
        })
      })

    characters.push({
      malId,
      // MAL llama "Ector" a los personajes sin ficha propia: se deja el
      // nombre tal cual, pero sin retrato (su imagen es un interrogante).
      name,
      nativeName,
      role,
      favourites,
      ...(image ? { image } : {}),
      voiceActors,
    })
  })

  return characters
}
