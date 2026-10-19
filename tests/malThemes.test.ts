import { describe, expect, test } from 'bun:test'
import { parseMalThemes } from '../src/shared/malAnimeHtml.js'

/**
 * Estructura real de la ficha de MAL (verificada contra `/anime/1735`): el
 * contenedor de openings trae la errata `opnening`, el de endings `ending`, y
 * cada `<tr>` lleva índice, título entrecomillado, artista, rango de episodios
 * y los `input hidden` de Spotify/Apple/Amazon.
 */
const row = (opts: {
  sid: number
  index: number
  title: string
  artist: string
  eps: string
  spotify?: string
  apple?: string
  amazon?: string
  video?: boolean
}) => `
<tr>
  <td width="8%"><div class="oped-preview-button" data-ga-click-param="sid:${opts.sid}"></div></td>
  <td width="84%"><span class="theme-song-index">${opts.index}:</span>&nbsp;<a href="javascript:openMusicLinkPopup('${opts.sid}', 'x', 'y', 'z');"><span class="theme-song-title">"${opts.title}"</span></a><span class="theme-song-artist"> by ${opts.artist}</span>&nbsp;<span class="theme-song-episode">(${opts.eps})</span><input type="hidden" id="spotify_url_${opts.sid}" value="${opts.spotify ?? ''}" />
<input type="hidden" id="apple_url_${opts.sid}" value="${opts.apple ?? ''}" />
<input type="hidden" id="amazon_url_${opts.sid}" value="${opts.amazon ?? ''}" />
<input type="hidden" id="youtube_url_${opts.sid}" value="" /></td>
  <td width="8%">${opts.video ? `<a href="https://myanimelist.net/anime/1735/Naruto__Shippuuden/video"><i></i></a>` : '<div class="oped-video-button-gray"></div>'}</td>
</tr>`

const page = (opening: string, ending: string) => `
<html><body>
<div class="di-tc"><h2>Opening Theme</h2></div>
<div class="theme-songs js-theme-songs opnening">
  <table>${opening}</table>
</div>
<div class="di-tc"><h2>Ending Theme</h2></div>
<div class="theme-songs js-theme-songs ending">
  <table>${ending}</table>
</div>
</body></html>`

describe('parseMalThemes (OP/ED de la ficha de MAL)', () => {
  test('separa OP de ED y saca nº, título, artista, eps e ids de tiendas', () => {
    const html = page(
      row({
        sid: 58386,
        index: 1,
        title: "Hero's Come Back",
        artist: 'Nobodyknows+',
        eps: 'eps 1-30',
        spotify: 'https://open.spotify.com/track/7weHG',
        apple:
          'https://music.apple.com/jp/album/heros-come-back/1536898528?i=1536898529',
        amazon: 'https://music.amazon.co.jp/search/x',
        video: true,
      }),
      row({
        sid: 58387,
        index: 1,
        title: 'distance',
        artist: 'LONG SHOT PARTY',
        eps: 'eps 1-30',
      })
    )

    const themes = parseMalThemes(html)
    expect(themes).toHaveLength(2)
    expect(themes[0]).toEqual({
      kind: 'OP',
      sequence: 1,
      title: "Hero's Come Back",
      artist: 'Nobodyknows+',
      malSongId: 58386,
      spotifyUrl: 'https://open.spotify.com/track/7weHG',
      appleUrl:
        'https://music.apple.com/jp/album/heros-come-back/1536898528?i=1536898529',
      appleTrackId: 1536898529,
      amazonUrl: 'https://music.amazon.co.jp/search/x',
      episodes: 'eps 1-30',
      hasVideo: true,
    })
    expect(themes[1]).toMatchObject({
      kind: 'ED',
      sequence: 1,
      title: 'distance',
      malSongId: 58387,
      appleTrackId: null,
      hasVideo: false,
    })
  })

  test('varios temas del mismo tipo conservan su número (OP1/OP2)', () => {
    const html = page(
      row({ sid: 1, index: 1, title: 'A', artist: 'X', eps: '1-12' }) +
        row({ sid: 2, index: 2, title: 'B', artist: 'Y', eps: '13-24' }),
      ''
    )
    expect(parseMalThemes(html).map((t) => t.sequence)).toEqual([1, 2])
  })

  test('ignora filas sin título (encabezados o temas vacíos en MAL)', () => {
    const html = page(
      `<tr><td><span class="theme-song-index">1:</span></td></tr>` +
        row({ sid: 3, index: 1, title: 'Real', artist: 'X', eps: '1-1' }),
      ''
    )
    expect(parseMalThemes(html)).toHaveLength(1)
    expect(parseMalThemes(html)[0]?.title).toBe('Real')
  })

  test('sin temas devuelve lista vacía (no rompe)', () => {
    expect(parseMalThemes('<html><body>nada</body></html>')).toEqual([])
  })
})
