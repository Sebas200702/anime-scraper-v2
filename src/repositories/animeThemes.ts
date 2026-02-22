import { music, musicResolution, musicVersion } from '../schemas/music.js'
import { db } from '../libs/db.js'
import type {
  NewMusicVersion,
  NewAnimeMusic,
  NewArtist,
  NewMusic,
  NewMusicArtist,
  NewMusicResolution,
  AnimeArtistProcessorResult,
  AnimeMusicProcessorResult,
  NewMedia,
} from '../types/index.js'
import { artist } from '../schemas/artist.js'
import { animeMusic } from '../schemas/animeRelations.js'
import { musicArtist } from '../schemas/musicRelations.js'
import { inArray } from 'drizzle-orm'
import { unique } from '../utils/deduplicate.js'
import { normalizeText } from '../utils/normalize.js'
import { media } from '../schemas/media.js'
import { chunk, SQLITE_MAX_VARIABLES } from '../utils/chunk.js'

export const animeThemesRepository = {
  async upsertMusicBatch(
    musicEntries: NewMusic[],
    txCtx?: any
  ): Promise<number> {
    try {
      if (!musicEntries || musicEntries.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 6)
      const run = async (tx: any) => {
        for (const batch of chunk(musicEntries, batchSize)) {
          await tx.insert(music).values(batch).onConflictDoNothing()
        }
      }
      if (txCtx) await run(txCtx)
      else await db.transaction(run)
      return musicEntries.length
    } catch (e) {
      console.error('Failed to upsert music batch:', e)
      return 0
    }
  },
  async upsertMusicVersionsBatch(
    musicVersionEntries: NewMusicVersion[],
    txCtx?: any
  ): Promise<number> {
    try {
      if (!musicVersionEntries || musicVersionEntries.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 4)
      const run = async (tx: any) => {
        for (const batch of chunk(musicVersionEntries, batchSize)) {
          await tx.insert(musicVersion).values(batch).onConflictDoNothing()
        }
      }
      if (txCtx) await run(txCtx)
      else await db.transaction(run)
      return musicVersionEntries.length
    } catch (e) {
      console.error('Failed to upsert music versions batch:', e)
      return 0
    }
  },
  async upsertMusicResolutionsBatch(
    musicResolutionEntries: NewMusicResolution[],
    txCtx?: any
  ): Promise<number> {
    try {
      if (!musicResolutionEntries || musicResolutionEntries.length === 0)
        return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 6)
      const run = async (tx: any) => {
        for (const batch of chunk(musicResolutionEntries, batchSize)) {
          await tx.insert(musicResolution).values(batch).onConflictDoNothing()
        }
      }
      if (txCtx) await run(txCtx)
      else await db.transaction(run)
      return musicResolutionEntries.length
    } catch (e) {
      console.error('Failed to upsert music resolutions batch:', e)
      return 0
    }
  },
  async upsertArtistBatch(
    artistEntries: NewArtist[],
    txCtx?: any
  ): Promise<number> {
    try {
      if (!artistEntries || artistEntries.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 3)
      const run = async (tx: any) => {
        for (const batch of chunk(artistEntries, batchSize)) {
          await tx.insert(artist).values(batch).onConflictDoNothing()
        }
      }
      if (txCtx) await run(txCtx)
      else await db.transaction(run)
      return artistEntries.length
    } catch (e) {
      console.error('Failed to upsert artist batch:', e)
      return 0
    }
  },
  async upsertAnimeMusicBatch(
    animeMusicEntries: NewAnimeMusic[],
    txCtx?: any
  ): Promise<number> {
    try {
      if (!animeMusicEntries || animeMusicEntries.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 4)
      const run = async (tx: any) => {
        for (const batch of chunk(animeMusicEntries, batchSize)) {
          await tx.insert(animeMusic).values(batch).onConflictDoNothing()
        }
      }
      if (txCtx) await run(txCtx)
      else await db.transaction(run)
      return animeMusicEntries.length
    } catch (e) {
      console.error('Failed to upsert anime music batch:', e)
      return 0
    }
  },
  async upsertArtistMediaBatch(
    artistMediaEntries: NewMedia[],
    txCtx?: any
  ): Promise<number> {
    try {
      if (!artistMediaEntries || artistMediaEntries.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 6)
      const run = async (tx: any) => {
        for (const batch of chunk(artistMediaEntries, batchSize)) {
          await tx.insert(media).values(batch).onConflictDoNothing()
        }
      }
      if (txCtx) await run(txCtx)
      else await db.transaction(run)
      return artistMediaEntries.length
    } catch (e) {
      console.error('Failed to upsert artist media batch:', e)
      return 0
    }
  },
  async upsertMusicArtistBatch(
    musicArtistEntries: NewMusicArtist[],
    txCtx?: any
  ): Promise<number> {
    try {
      if (!musicArtistEntries || musicArtistEntries.length === 0) return 0
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 2)
      const run = async (tx: any) => {
        for (const batch of chunk(musicArtistEntries, batchSize)) {
          await tx.insert(musicArtist).values(batch).onConflictDoNothing()
        }
      }
      if (txCtx) await run(txCtx)
      else await db.transaction(run)
      return musicArtistEntries.length
    } catch (e) {
      console.error('Failed to upsert music artist batch:', e)
      return 0
    }
  },

  async saveAnimeThemes(
    musicResult: AnimeMusicProcessorResult[]
  ): Promise<number> {
    const musics: NewMusic[] = []
    const versions: NewMusicVersion[] = []
    const resolutions: NewMusicResolution[] = []
    const musicArtists: NewMusicArtist[] = []
    const animeMusics: NewAnimeMusic[] = []

    const processAnimeMusicArtists = async (
      animeMusics: { musicId: number; artistName: string }[]
    ): Promise<NewMusicArtist[]> => {
      if (animeMusics.length === 0) return []

      // 1️⃣ nombres únicos normalizados
      const artistNames = unique<string>(
        animeMusics
          .map((am) => am?.artistName)
          .filter((name) => name !== undefined),
        (name) => normalizeText(name)
      )

      // 2️⃣ buscar artistas existentes
      let existingArtists: { id: number; name: string }[] = []
      for (const batch of chunk(artistNames, SQLITE_MAX_VARIABLES)) {
        const found = await db
          .select({ id: artist.id, name: artist.name })
          .from(artist)
          .where(inArray(artist.name, batch))
        existingArtists.push(...found)
      }

      const artistMap = new Map<string, number>()
      for (const a of existingArtists) {
        artistMap.set(normalizeText(a.name), a.id)
      }

      // 3️⃣ detectar artistas faltantes
      const newArtistEntries: NewArtist[] = []
      for (const name of artistNames) {
        if (!artistMap.has(normalizeText(name))) {
          newArtistEntries.push({ name })
        }
      }

      // 4️⃣ crear artistas nuevos
      if (newArtistEntries.length > 0) {
        await this.upsertArtistBatch(newArtistEntries)

        // volver a consultar para obtener IDs
        let insertedArtists: { id: number; name: string }[] = []
        const insertedNames = newArtistEntries.map((a) => a.name)
        for (const batch of chunk(insertedNames, SQLITE_MAX_VARIABLES)) {
          const found = await db
            .select({ id: artist.id, name: artist.name })
            .from(artist)
            .where(inArray(artist.name, batch))
          insertedArtists.push(...found)
        }

        for (const a of insertedArtists) {
          artistMap.set(normalizeText(a.name), a.id)
        }
      }

      // 5️⃣ crear relaciones music ↔ artist con IDs válidos
      const relations: NewMusicArtist[] = []

      for (const am of animeMusics) {
        const artistId = artistMap.get(normalizeText(am?.artistName))
        if (!artistId) continue

        relations.push({
          musicId: am.musicId,
          artistId,
        })
      }

      return relations
    }

    // =====================================================
    // Recolección
    // =====================================================
    for (const result of musicResult) {
      if (result.musics) musics.push(...result.musics)
      if (result.musicVersions) versions.push(...result.musicVersions)
      if (result.musicResolutions) resolutions.push(...result.musicResolutions)
      if (result.animeMusics) animeMusics.push(...result.animeMusics)

      if (result.musicArtists) {
        const relations = await processAnimeMusicArtists(result.musicArtists)
        musicArtists.push(...relations)
      }
    }

    // =====================================================
    // Dedupe
    // =====================================================
    const uniqueMusics = unique<NewMusic>(
      musics,
      (m) => `${m.id}:${normalizeText(m.title || '')}`
    )

    const uniqueMusicVersions = unique<NewMusicVersion>(
      versions,
      (mv) => `${mv.musicId}:${mv.versionId}`
    )

    const uniqueMusicResolutions = unique<NewMusicResolution>(
      resolutions,
      (mr) => `${mr.songId}:${mr.resolution}`
    )

    const uniqueMusicArtists = unique<NewMusicArtist>(
      musicArtists,
      (ma) => `${ma.musicId}:${ma.artistId}`
    )

    const uniqueAnimeMusics = unique<NewAnimeMusic>(
      animeMusics,
      (am) => `${am.animeId}:${am.musicId}`
    )

    // =====================================================
    // Inserciones — 1 sola transacción para todo el save
    // =====================================================
    await db.transaction(async (tx) => {
      // Music primero (FK parent)
      await this.upsertMusicBatch(uniqueMusics, tx)
      // Children dependen de music, pero no entre sí
      await this.upsertMusicVersionsBatch(uniqueMusicVersions, tx)
      await this.upsertAnimeMusicBatch(uniqueAnimeMusics, tx)
      await this.upsertMusicResolutionsBatch(uniqueMusicResolutions, tx)
      await this.upsertMusicArtistBatch(uniqueMusicArtists, tx)
    })

    return uniqueMusics.length
  },

  async saveArtist(
    artistResults: AnimeArtistProcessorResult[]
  ): Promise<number> {
    const artists: NewArtist[] = []
    const artistMedias: NewMedia[] = []
    const processArtistMedia = async (
      artistMedia: {
        entityType: string
        artistName: string
        mediaType: string
        src: string
        id?: number
        size?: string | null
      }[]
    ) => {
      if (artistMedia.length === 0) return
      const medias = []

      const artistNames = artistMedia.map((am) => am.artistName)
      let artistIds: { id: number; name: string }[] = []
      for (const batch of chunk(artistNames, SQLITE_MAX_VARIABLES)) {
        const found = await db
          .select({ id: artist.id, name: artist.name })
          .from(artist)
          .where(inArray(artist.name, batch))
        artistIds.push(...found)
      }

      const artistIdMap = new Map<string, number>()
      for (const a of artistIds) {
        artistIdMap.set(normalizeText(a.name), a.id)
      }
      //Crear los artistas que faltan
      const newArtistEntries: NewArtist[] = []
      for (const am of artistMedia) {
        if (!artistIdMap.has(normalizeText(am.artistName))) {
          newArtistEntries.push({ name: am.artistName })
        }
      }

      if (newArtistEntries.length > 0) {
        await this.upsertArtistBatch(newArtistEntries)
      }
      //Volver a consultar para obtener los IDs
      const allArtistNames = artistMedia.map((am) => am.artistName)
      let allArtists: { id: number; name: string }[] = []
      for (const batch of chunk(allArtistNames, SQLITE_MAX_VARIABLES)) {
        const found = await db
          .select({ id: artist.id, name: artist.name })
          .from(artist)
          .where(inArray(artist.name, batch))
        allArtists.push(...found)
      }

      for (const a of allArtists) {
        artistIdMap.set(normalizeText(a.name), a.id)
      }
      for (const am of artistMedia) {
        const artistId = artistIdMap.get(normalizeText(am.artistName))
        if (!artistId) continue
        medias.push({
          entityId: artistId,
          entityType: am.entityType,
          mediaType: am.mediaType,
          src: am.src,
          size: am.size || 'default',
        })
      }

      return medias
    }

    for (const result of artistResults) {
      if (result.artist) artists.push(result.artist)
      if (result.artistMedias) {
        const medias = await processArtistMedia(result.artistMedias)
        if (medias) artistMedias.push(...medias)
      }
    }

    const uniqueArtists = unique<NewArtist>(artists, (a) =>
      normalizeText(a.name)
    )

    const uniqueArtistMedias = unique<NewMedia>(
      artistMedias,
      (m) => `${m.entityId}:${m.entityType}:${m.mediaType}:${m.src}:${m.size}`
    )

    await db.transaction(async (tx) => {
      await this.upsertArtistBatch(uniqueArtists, tx)
      await this.upsertArtistMediaBatch(uniqueArtistMedias, tx)
    })

    return uniqueArtists.length
  },
}
