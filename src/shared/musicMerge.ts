/**
 * Merge de temas musicales entre fuentes.
 *
 * Cada fuente (MAL, AnimeThemes, ANN) publica los OP/ED con su propio
 * formato y su propio id. Para que la canción sea **una sola fila**, se cruzan
 * por `(anime, tipo, título normalizado)`:
 *
 * - si ya existe la canción (la fila de AnimeThemes con su vídeo/audio, o la
 *   que creó MAL), los metadatos de la nueva fuente se **anexan** a esa fila;
 * - si no existe, se crea con el id reservado de la fuente.
 *
 * Cuando hay varias filas candidatas gana la que **tiene media** (la que se
 * puede reproducir en la app).
 */
import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { normalizeSongTitle } from './malMusicIds.js'

export interface ThemeInput {
  /** Id de la fuente (ANN) del anime: permite ids de música estables. */
  annId?: number
  animeId: number
  kind: 'OP' | 'ED'
  sequence: number | null
  title: string
  artist: string | null
  episodes: string | null
}

export interface MergedTheme extends ThemeInput {
  musicId: number
  /** `true` si la fila de `music` hay que crearla. */
  isNew: boolean
}

export const themeKey = (t: {
  animeId: number
  kind: string
  title: string
}): string => `${t.animeId}|${t.kind}|${normalizeSongTitle(t.title)}`

/**
 * Resuelve qué id de `music` usa cada tema.
 *
 * @param themes - Temas de la fuente, ya normalizados.
 * @param newMusicId - Id reservado para los temas que aún no existen. Debe ser
 *   estable (mismo tema → mismo id) para que la fila no se duplique.
 */
export const mergeThemes = async (
  themes: ThemeInput[],
  newMusicId: (theme: ThemeInput, index: number) => number
): Promise<MergedTheme[]> => {
  if (themes.length === 0) return []

  const animeIds = [...new Set(themes.map((t) => t.animeId))]
  const existing = new Map<string, number>()
  for (let i = 0; i < animeIds.length; i += 500) {
    const batch = animeIds.slice(i, i + 500)
    const rows = await db.execute(sql`
      SELECT am.anime_id, m.id, m.title, m.type,
             (SELECT count(*) FROM music_version mv
                JOIN music_resolution mr ON mr.music_version_id = mv.version_id
               WHERE mv.music_id = m.id) AS media
      FROM anime_music am
      JOIN music m ON m.id = am.music_id
      WHERE am.anime_id IN (${sql.join(
        batch.map((id) => sql`${id}`),
        sql`, `
      )})
      ORDER BY media DESC
    `)
    for (const row of rows.rows as unknown as {
      anime_id: number
      id: number
      title: string | null
      type: string
    }[]) {
      const key = themeKey({
        animeId: row.anime_id,
        kind: row.type,
        title: row.title ?? '',
      })
      if (!existing.has(key)) existing.set(key, row.id)
    }
  }

  const used = new Set<number>()
  const out: MergedTheme[] = []
  themes.forEach((theme, index) => {
    const key = themeKey(theme)
    let musicId = existing.get(key)
    let isNew = false
    if (musicId === undefined) {
      musicId = newMusicId(theme, index)
      // Si dos temas del mismo lote caen en la misma fila (títulos idénticos),
      // se reapunta a la fila ya creada en este lote.
      if (used.has(musicId)) {
        out.push({ ...theme, musicId, isNew: false })
        return
      }
      used.add(musicId)
      isNew = true
      existing.set(key, musicId)
    }
    out.push({ ...theme, musicId, isNew })
  })
  return out
}
