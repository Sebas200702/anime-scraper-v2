import { describe, expect, test } from 'bun:test'
import { parseMalAnimeCharacters } from '../src/shared/malAnimeHtml.js'

// Fixture mínima con la estructura real de la ficha de MAL.
const HTML = `
<html><body>
<table>
  <tr>
    <td class="ac"><div class="picSurround"><a href="https://myanimelist.net/character/11/Edward_Elric"><img data-src="https://cdn.myanimelist.net/r/42x62/images/characters/9/72533.jpg?s=x" /></a></div></td>
    <td><h3 class="h3_characters_voice_actors"><a href="https://myanimelist.net/character/11/Edward_Elric">Elric, Edward</a></h3><div><small>Main</small></div></td>
    <td class="va-t"><a href="https://myanimelist.net/people/82/Romi_Park">Park, Romi</a><br><small>Japanese</small></td>
    <td><div class="picSurround"><a href="https://myanimelist.net/people/82/Romi_Park"><img data-src="https://cdn.myanimelist.net/r/42x62/images/voiceactors/1/54602.jpg?s=y" /></a></div></td>
  </tr>
</table>
<div><h2>Staff</h2></div>
<div class="detail-characters-list clearfix"><div class="left-column">
  <table><tr>
    <td><a href="https://myanimelist.net/people/62835/Hiroo_Maruyama">Maruyama, Hiroo</a><div><small>Producer</small></div></td>
    <td><div class="picSurround"><img data-src="https://cdn.myanimelist.net/r/42x62/images/voiceactors/1/74213.jpg?s=z" /></div></td>
  </tr></table>
</div></div>
</body></html>`

describe('parseMalAnimeCharacters (ficha HTML de MAL)', () => {
  test('extrae personajes, rol, seiyuu con idioma y su retrato', () => {
    const { animeCharacters } = parseMalAnimeCharacters(HTML)
    expect(animeCharacters).toHaveLength(1)
    const char = animeCharacters[0]
    expect(char?.malId).toBe(11)
    expect(char?.name).toBe('Elric, Edward')
    expect(char?.role).toBe('Main')
    // El prefijo de reescalado se quita para guardar el original.
    expect(char?.image).toBe(
      'https://cdn.myanimelist.net/images/characters/9/72533.jpg?s=x'
    )
    expect(char?.voiceActors).toEqual([
      {
        malId: 82,
        name: 'Park, Romi',
        language: 'Japanese',
        image: 'https://cdn.myanimelist.net/images/voiceactors/1/54602.jpg?s=y',
      },
    ])
  })

  test('extrae el staff con su rol (y solo la sección de staff)', () => {
    const { animeStaff } = parseMalAnimeCharacters(HTML)
    expect(animeStaff).toHaveLength(1)
    expect(animeStaff[0]).toMatchObject({
      malId: 62835,
      name: 'Maruyama, Hiroo',
      roles: ['Producer'],
    })
  })

  test('HTML sin secciones no rompe', () => {
    expect(parseMalAnimeCharacters('<html></html>')).toEqual({
      animeCharacters: [],
      animeStaff: [],
    })
  })
})
