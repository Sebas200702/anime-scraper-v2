import { describe, expect, test } from 'bun:test'
import { parseMalFavorites } from '../src/shared/malAnimeHtml.js'

describe('parseMalFavorites (favoritos de MAL, solo en el HTML)', () => {
  test('saca el número con separador de miles', () => {
    const html = `<div>Popularity: #9</div><div>Members: 3,170,632</div><div>Favorites: 88,028</div>`
    expect(parseMalFavorites(html)).toBe(88028)
  })

  test('sin la estadística devuelve null', () => {
    expect(parseMalFavorites('<html>nada</html>')).toBeNull()
  })

  test('no confunde con el "Favorites:" de los widgets JS', () => {
    // El widget de series relacionadas lleva `Favorites: ${ item.payload.favorites }`
    // dentro de un template: no es un número, así que no debe accounted.
    const html = `<script>extra-info">Favorites: \${ item.payload.favorites }</script>`
    expect(parseMalFavorites(html)).toBeNull()
  })
})
