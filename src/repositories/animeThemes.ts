import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { music, musicResolution, musicVersion } from '../schemas/music.js'
import { artist } from '../schemas/artist.js'
import { anime } from '../schemas/anime.js'
import { animeMusic } from '../schemas/animeRelations.js'
import { musicArtist } from '../schemas/musicRelations.js'
import { mediaRepository } from './media.js'
import { unique } from '../utils/deduplicate.js'
import { normalizeText } from '../utils/normalize.js'
import { batchUpsert } from '../shared/batchUpsert.js'
import { chunk } from '../utils/chunk.js'
import { filterByExistingFk } from '../shared/fkFilter.js'

import { resolveArtistIds } from '../shared/artistResolver.js'
import type {
  AnimeMusicProcessorResult,
  AnimeArtistProcessorResult,
  NewMusic,
  NewMusicVersion,
  NewMusicResolution,
  NewMusicArtist,
  NewAnimeMusic,
  NewArtist,
  NewMedia,
} from '../types/index.js'

export const animeThemesRepository = {
  async saveAnimeThemes(
    musicResults: AnimeMusicProcessorResult[]
  ): Promise<number> {
    const musics: NewMusic[] = []
    const versions: NewMusicVersion[] = []
    const resolutions: NewMusicResolution[] = []
    const musicArtists: NewMusicArtist[] = []
    const animeMusics: NewAnimeMusic[] = []

    for (const result of musicResults) {
      if (result.musics) musics.push(...result.musics)
      if (result.musicVersions) versions.push(...result.musicVersions)
      if (result.musicResolutions) resolutions.push(...result.musicResolutions)
      if (result.animeMusics) animeMusics.push(...result.animeMusics)

      if (result.musicArtists) {
        const artistNames = result.musicArtists
          .map((ma) => ma?.artistName)
          .filter(Boolean)
        const artistMap = await resolveArtistIds(artistNames)

        for (const ma of result.musicArtists) {
          const artistId = artistMap.get(normalizeText(ma?.artistName))
          if (artistId) {
            musicArtists.push({ musicId: ma.musicId, artistId })
          }
        }
      }
    }

    const uMusics = unique(
      musics,
      (m) => `${m.id}:${normalizeText(m.title || '')}`
    )
    const uVersions = unique(versions, (mv) => `${mv.musicId}:${mv.versionId}`)
    const uResolutions = unique(
      resolutions,
      (mr) => `${mr.songId}:${mr.resolution}`
    )
    const uMusicArtists = unique(
      musicArtists,
      (ma) => `${ma.musicId}:${ma.artistId}`
    )
    const uAnimeMusics = unique(
      animeMusics,
      (am) => `${am.animeId}:${am.musicId}`
    )

    // El anime puede no existir todavía en la DB (el listado de Jikan va antes):
    // se filtra y se avisa al manager, que marcará la tarea `skipped` en vez de
    // romper por FK y perder la música.
    const validAnimeMusics = await filterByExistingFk(
      uAnimeMusics,
      (am) => am.animeId,
      anime,
      anime.malId
    )

    await db.transaction(async (tx) => {
      await batchUpsert(music, uMusics, 6, 'music', tx)
      await batchUpsert(musicVersion, uVersions, 4, 'music-versions', tx)
      await batchUpsert(animeMusic, validAnimeMusics, 4, 'anime-music', tx)
      // `music_resolution` se **actualiza**, no se ignora: sus URLs se
      // corrigieron (host de audio/vídeo) y las filas viejas quedaron con 404.
      // La identidad es (song_id, resolution), así que el conflicto reescribe
      // las URLs en vez de dejar la fila rota.
      for (const batch of chunk(uResolutions, 6)) {
        await tx
          .insert(musicResolution)
          .values(batch)
          .onConflictDoUpdate({
            target: [musicResolution.songId, musicResolution.resolution],
            set: {
              audioUrl: sql`excluded.audio_url`,
              videoUrl: sql`excluded.video_url`,
              musicVersionId: sql`excluded.music_version_id`,
            },
          })
      }
      await batchUpsert(musicArtist, uMusicArtists, 2, 'music-artists', tx)
    })

    return uMusics.length
  },

  async saveArtist(
    artistResults: AnimeArtistProcessorResult[]
  ): Promise<number> {
    const artists: NewArtist[] = []
    const artistMedias: NewMedia[] = []

    for (const result of artistResults) {
      if (result.artist) artists.push(result.artist)

      if (result.artistMedias) {
        const artistNames = result.artistMedias.map((am) => am.artistName)
        const artistMap = await resolveArtistIds(artistNames)

        for (const am of result.artistMedias) {
          const artistId = artistMap.get(normalizeText(am.artistName))
          if (artistId) {
            artistMedias.push({
              entityId: artistId,
              entityType: am.entityType as NewMedia['entityType'],
              mediaType: am.mediaType,
              src: am.src,
              size: am.size || 'default',
            })
          }
        }
      }
    }

    const uArtists = unique(artists, (a) => normalizeText(a.name))
    const uMedia = unique(
      artistMedias,
      (m) => `${m.entityId}:${m.entityType}:${m.mediaType}:${m.src}:${m.size}`
    )

    await db.transaction(async (tx) => {
      await batchUpsert(artist, uArtists, 3, 'artists', tx)

      // `artist.mal_id` referencia `staff.mal_id` y `batchUpsert` hace
      // `DO NOTHING`: los artistas creados por nombre (desde las performances)
      // nunca recibían su id MAL aunque la ficha de la persona lo traiga. Se
      // rellena solo si la persona ya existe en `staff` (si no, la FK rompería
      // la transacción entera y se perderían todos los artistas del lote).
      const withMal = uArtists.filter(
        (a): a is typeof a & { malId: number } =>
          typeof a.malId === 'number' && a.malId > 0
      )
      for (const batch of chunk(withMal, 500)) {
        const values = sql.join(
          batch.map((a) => sql`(${a.malId}::int, ${a.name}::text)`),
          sql`, `
        )
        await tx.execute(sql`
          UPDATE artist a
          SET mal_id = v.mal_id
          FROM (VALUES ${values}) AS v(mal_id, name)
          WHERE a.name = v.name
            AND a.mal_id IS DISTINCT FROM v.mal_id
            AND EXISTS (SELECT 1 FROM staff s WHERE s.mal_id = v.mal_id)
        `)
      }

      await mediaRepository.saveMedia(uMedia, 'animethemes')
    })

    return uArtists.length
  },
}
