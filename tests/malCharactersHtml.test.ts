import { describe, expect, test } from 'bun:test'
import {
  normalizeCastRole,
  parseMalCharactersPage,
} from '../src/shared/malCharactersHtml.js'

// Fila con la estructura real de `/anime/{id}/characters` (ver doc del parser).
const row = (role: string, roll = 'm_Black, Jet') => `
<tr>
  <td><a href="/character/3/Jet_Black"><img data-src="https://cdn.myanimelist.net/r/42x62/images/characters/11/253723.jpg?s=x"></a></td>
  <td>
    <div class="js-chara-roll-and-name" style="display:none">${roll}</div>
    <div class="js-anime-character-favorites" style="display:none;">2321</div>
    <div class="spaceit_pad"><a href="/character/3/Jet_Black"><h3 class="h3_character_name">Black, Jet</h3></a></div>
    <div class="spaceit_pad">${role}</div>
    <div class="spaceit_pad" style="color:#787878;">2,321 Favorites</div>
  </td>
  <td><table class="js-anime-character-va">
    <tr class="js-anime-character-va-lang">
      <td><div class="spaceit_pad"><a href="/people/357/Unshou_Ishizuka">Ishizuka, Unshou</a></div>
          <div class="spaceit_pad js-anime-character-language">Japanese</div></td>
      <td><a href="/people/357/Unshou_Ishizuka"><img data-src="https://cdn.myanimelist.net/r/42x62/images/voiceactors/2/17135.jpg"></a></td>
    </tr>
  </table></td>
</tr>`

const page = (...rows: string[]) =>
  `<html><body><table class="js-anime-character-table">${rows.join('')}</table></body></html>`

describe('parseMalCharactersPage (página de personajes de MAL)', () => {
  test('el div oculto rol+romaji no se guarda como nombre nativo (S4)', () => {
    const [char] = parseMalCharactersPage(page(row('Main')))
    expect(char?.malId).toBe(3)
    expect(char?.name).toBe('Black, Jet')
    expect(char?.nativeName).toBeNull()
    expect(char?.role).toBe('Main')
    expect(char?.favourites).toBe(2321)
    expect(char?.voiceActors).toEqual([
      {
        malId: 357,
        name: 'Ishizuka, Unshou',
        language: 'Japanese',
        image: 'https://cdn.myanimelist.net/images/voiceactors/2/17135.jpg',
      },
    ])
  })

  test('un rol con otra capitalización sale en el vocabulario MAL (S3)', () => {
    const chars = parseMalCharactersPage(
      page(row('SUPPORTING', 's_Black, Jet'), row(' background '))
    )
    expect(chars.map((c) => c.role)).toEqual(['Supporting', 'Background'])
  })
})

describe('normalizeCastRole (S3)', () => {
  test('Main / Supporting / Background sin importar la capitalización', () => {
    expect(normalizeCastRole('MAIN')).toBe('Main')
    expect(normalizeCastRole('supporting')).toBe('Supporting')
    expect(normalizeCastRole('Background')).toBe('Background')
  })

  test('un rol fuera del vocabulario se conserva recortado', () => {
    expect(normalizeCastRole('  Unknown ')).toBe('Unknown')
  })
})
