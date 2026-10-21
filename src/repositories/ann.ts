import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { music } from '../schemas/music.js'
import { animeMusic } from '../schemas/animeRelations.js'
import { musicArtist } from '../schemas/musicRelations.js'
import { batchUpsert } from '../shared/batchUpsert.js'
import { mergeThemes, type ThemeInput } from '../shared/musicMerge.js'
import { resolveArtistIds } from '../shared/artistResolver.js'
import { normalizeText } from '../utils/normalize.js'
import { unique } from '../utils/deduplicate.js'
import type { AnnProcessorResult } from '../types/index.js'

/**
 * Tramo reservado para las canciones que crea ANN.
 *
 * ANN no tiene id de canción (sus temas son texto), así que el id se compone
 * con el id de anime de ANN y la posición del tema: `1.3e9 + annId * 100 + n`.
 * Separate de los tramos de MAL (1e9) y del resto para que no se pisen.
 */
export const ANN_MUSIC_ID_BASE = 1_300_000_000

export const annMusicId = (annId: number, index: number): number =>
  ANN_MUSIC_ID_BASE + annId * 100 + (index % 100)

/**
 * Guarda los OP/ED de ANN.
 *
 * Se anexan a la fila existente cuando la canción ya está (MAL o AnimeThemes):
 * ANN aporta el **nº de tema** y el **rango de episodios**, que son los datos
 * que faltaban.
 */
export const annRepository = {
  async saveAnnThemes(results: AnnProcessorResult[]): Promise<number> {
    const themes: (ThemeInput & { annId: number })[] = []
    for (const result of results) {
      if (result.mismatched) continue
      for (const theme of result.themes) {
        themes.push({
          annId: theme.annId,
          animeId: theme.animeId,
          kind: theme.kind,
          sequence: theme.sequence,
          title: theme.title,
          artist: theme.artist,
          episodes: theme.episodes,
        })
      }
    }
    if (themes.length === 0) return 0

    const merged = await mergeThemes(themes, (theme, index) =>
      annMusicId(theme.annId ?? 0, index)
    )

    const newMusic = merged
      .filter((t) => t.isNew)
      .map((t) => ({ id: t.musicId, title: t.title, type: t.kind }))
    const uMusic = unique(newMusic, (m) => `${m.id}`)

    const links = unique(
      merged.map((t) => ({
        animeId: t.animeId,
        musicId: t.musicId,
        sequence: t.sequence,
        episodes: t.episodes,
      })),
      (l) => `${l.animeId}:${l.musicId}`
    )

    await db.transaction(async (tx) => {
      await batchUpsert(music, uMusic, 3, 'music', tx)
      for (const batch of chunkRows(links, 200)) {
        await tx
          .insert(animeMusic)
          .values(batch)
          .onConflictDoUpdate({
            target: [animeMusic.animeId, animeMusic.musicId],
            // COALESCE: ANN rellena los huecos de nº/rango, no pisa lo que ya
            // había (ni lo borra).
            set: {
              sequence: sql`COALESCE(excluded.sequence, "anime_music"."sequence")`,
              episodes: sql`COALESCE(excluded.episodes, "anime_music"."episodes")`,
            },
          })
      }
    })

    // Artistas: se resuelve por nombre (ANN los publica como texto).
    const credits = unique(
      merged
        .filter((t) => t.artist)
        .map((t) => ({ musicId: t.musicId, artistName: t.artist as string })),
      (c) => `${c.musicId}:${c.artistName}`
    )
    let artistLinks = 0
    if (credits.length > 0) {
      const artistMap = await resolveArtistIds(credits.map((c) => c.artistName))
      const rows = credits
        .map((c) => {
          const artistId = artistMap.get(normalizeText(c.artistName))
          return artistId ? { musicId: c.musicId, artistId } : null
        })
        .filter((r): r is { musicId: number; artistId: number } => r !== null)
      const uRows = unique(rows, (r) => `${r.musicId}:${r.artistId}`)
      for (const batch of chunkRows(uRows, 500)) {
        await db.insert(musicArtist).values(batch).onConflictDoNothing()
      }
      artistLinks = uRows.length
    }

    return uMusic.length + links.length + artistLinks
  },
}

const chunkRows = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}
