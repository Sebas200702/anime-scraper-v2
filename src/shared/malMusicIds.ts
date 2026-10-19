/**
 * Rangos de ids reservados para la música que viene de MAL.
 *
 * `music.id`, `music_version.version_id` y `music_resolution.song_id` son
 * enteros que hoy ocupan AnimeThemes (ids de tema/entrada/vídeo) y MAL (id de
 * canción, `openMusicLinkPopup`). Si se mezclaran, una canción de MAL podría
 * pisar una fila de AnimeThemes, así que cada espacio vive en su propio tramo
 * (los tres caben de sobra en `int4`).
 *
 * La clave de una canción de MAL es su `malSongId`, que es global: la misma
 * canción reusada en otra temporada apunta a la misma fila.
 */
import { normalizeText } from '../utils/normalize.js'

export const MAL_MUSIC_ID_BASE = 1_000_000_000
export const MAL_VERSION_ID_BASE = 1_100_000_000
export const MAL_SONG_ID_BASE = 1_200_000_000

/** Id de `music` para una canción de MAL. */
export const malMusicId = (malSongId: number): number =>
  MAL_MUSIC_ID_BASE + malSongId

/** Id de `music_version.version_id` (variante) para una canción de MAL. */
export const malVersionId = (malSongId: number): number =>
  MAL_VERSION_ID_BASE + malSongId

/** Id de `music_resolution.song_id` para una canción de MAL. */
export const malSongRowId = (malSongId: number): number =>
  MAL_SONG_ID_BASE + malSongId

/**
 * Clave de comparación de títulos de canción entre fuentes.
 *
 * MAL y AnimeThemes titulan distinto el mismo tema: `Nagare Boshi ~Shooting
 * Star~ (流れ星〜Shooting Star〜)` (MAL) vs `Nagareboshi ~Shooting Star~`
 * (AnimeThemes). Para que los metadatos de MAL se anexen a la fila de
 * AnimeThemes (y no se dupliquen) se comparan sin grupos entre paréntesis
 * (incluidos los japoneses), sin espacios, sin puntuación y en minúsculas.
 *
 * Los grupos se recortan porque suelen repetir el título en japonés o marcar la
 * variante (`(TV Size)`, `(Movie Ver.)`), no para cambiar de canción.
 */
export const normalizeSongTitle = (
  title: string | null | undefined
): string => {
  if (!title) return ''
  return normalizeText(title)
    .replace(/[（(\[【].*?[)）\]】]/g, ' ')
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, '')
}

