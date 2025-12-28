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

export const animeThemesRepository = {
  async upsertMusicBatch(musicEntries: NewMusic[]): Promise<number> {
    try {
      const existingMusics = await db
        .select()
        .from(music)
        .where(
          inArray(
            music.id,
            musicEntries.map((m) => m.id!)
          )
        )
      const existingMusicIds = new Set(existingMusics.map((m) => m.id))
      const newMusicEntries = musicEntries.filter(
        (m) => !existingMusicIds.has(m.id!)
      )
      if (newMusicEntries.length === 0) {
        console.log('No new music entries to insert.')
        return 0
      }
      await db.insert(music).values(newMusicEntries)
      return newMusicEntries.length
    } catch (e) {
      console.error('Failed to upsert music batch:', e)
      return 0
    }
  },
  async upsertMusicVersionsBatch(
    musicVersionEntries: NewMusicVersion[]
  ): Promise<number> {
    try {
      const existingVersions = await db
        .select({
          musicId: musicVersion.musicId,
          versionId: musicVersion.versionId,
        })
        .from(musicVersion)
        .where(
          inArray(
            musicVersion.versionId,
            musicVersionEntries.map((mv) => mv.versionId)
          )
        )
      const existingVersionIds = new Set(
        existingVersions.map((mv) => mv.versionId)
      )
      const newMusicVersionEntries = musicVersionEntries.filter(
        (mv) => !existingVersionIds.has(mv.versionId)
      )
      if (newMusicVersionEntries.length === 0) {
        console.log('No new music version entries to insert.')
        return 0
      }

      await db.insert(musicVersion).values(newMusicVersionEntries)

      return newMusicVersionEntries.length
    } catch (e) {
      console.error('Failed to upsert music versions batch:', e)
      return 0
    }
  },
  async upsertMusicResolutionsBatch(
    musicResolutionEntries: NewMusicResolution[]
  ): Promise<number> {
    try {
      const existingResolutions = await db
        .select({
          songId: musicResolution.songId,
        })
        .from(musicResolution)
        .where(
          inArray(
            musicResolution.songId,
            musicResolutionEntries.map((mr) => mr.songId)
          )
        )
      const existingResolutionIds = new Set(
        existingResolutions.map((mr) => mr.songId)
      )

      const newMusicResolutionEntries = musicResolutionEntries.filter(
        (mr) => !existingResolutionIds.has(mr.songId)
      )
      if (newMusicResolutionEntries.length === 0) {
        console.log('No new music resolution entries to insert.')
        return 0
      }

      await db.insert(musicResolution).values(newMusicResolutionEntries)

      return newMusicResolutionEntries.length
    } catch (e) {
      console.error('Failed to upsert music resolutions batch:', e)
      return 0
    }
  },
  async upsertArtistBatch(artistEntries: NewArtist[]): Promise<number> {
    try {
      const existingArtists = await db
        .select({ name: artist.name })
        .from(artist)
        .where(
          inArray(
            artist.name,
            artistEntries.map((a) => a.name)
          )
        )
      const existingArtistNames = new Set(existingArtists.map((a) => a.name))
      const newArtistEntries = artistEntries.filter(
        (a) => !existingArtistNames.has(a.name)
      )
      if (newArtistEntries.length === 0) {
        console.log('No new artist entries to insert.')
        return 0
      }

      await db.insert(artist).values(newArtistEntries)
      return newArtistEntries.length
    } catch (e) {
      console.error('Failed to upsert artist batch:', e)
      return 0
    }
  },
  async upsertAnimeMusicBatch(
    animeMusicEntries: NewAnimeMusic[]
  ): Promise<number> {
    try {
      const existingAnimeMusic = await db
        .select({
          animeId: animeMusic.animeId,
          musicId: animeMusic.musicId,
        })
        .from(animeMusic)
        .where(
          inArray(
            animeMusic.musicId,
            animeMusicEntries.map((am) => am.musicId)
          )
        )
      const existingAnimeMusicIds = new Set(
        existingAnimeMusic.map((am) => am.musicId)
      )
      const newAnimeMusicEntries = animeMusicEntries.filter(
        (am) => !existingAnimeMusicIds.has(am.musicId)
      )

      if (newAnimeMusicEntries.length === 0) {
        console.log('No new anime music entries to insert.')
        return 0
      }

      await db.insert(animeMusic).values(newAnimeMusicEntries)

      return newAnimeMusicEntries.length
    } catch (e) {
      console.error('Failed to upsert anime music batch:', e)
      return 0
    }
  },
  async upsertArtistMediaBatch(
    artistMediaEntries: NewMedia[]
  ): Promise<number> {
    try {
      const existingMedias = await db
        .select()
        .from(media)
        .where(
          inArray(
            media.src,
            artistMediaEntries.map((m) => m.src)
          )
        )
      const existingMediaSrcs = new Set(existingMedias.map((m) => m.src))
      const newMediaEntries = artistMediaEntries.filter(
        (m) => !existingMediaSrcs.has(m.src)
      )
      if (newMediaEntries.length === 0) {
        console.log('No new artist media entries to insert.')
        return 0
      }

      await db.insert(media).values(newMediaEntries)
      return newMediaEntries.length
    } catch (e) {
      console.error('Failed to upsert artist media batch:', e)
      return 0
    }
  },
  async upsertMusicArtistBatch(
    musicArtistEntries: NewMusicArtist[]
  ): Promise<number> {
    try {
      const existingMusicArtists = await db
        .select({
          musicId: musicArtist.musicId,
          artistId: musicArtist.artistId,
        })
        .from(musicArtist)

      const existingSet = new Set(
        existingMusicArtists.map((e) => `${e.musicId}:${e.artistId}`)
      )

      const newEntries = musicArtistEntries.filter(
        (ma) => !existingSet.has(`${ma.musicId}:${ma.artistId}`)
      )

      if (newEntries.length === 0) {
        console.log('No new music artist entries to insert.')
        return 0
      }

      await db.insert(musicArtist).values(newEntries)

      return newEntries.length
    } catch (e) {
      console.error('Failed to upsert music artist batch:', e)
      return 0
    }
  },

  async saveAnimeThemes(
    musicResult: AnimeMusicProcessorResult[]
  ): Promise<void> {
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
      let existingArtists = await db
        .select({ id: artist.id, name: artist.name })
        .from(artist)
        .where(inArray(artist.name, artistNames))

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
        const insertedArtists = await db
          .select({ id: artist.id, name: artist.name })
          .from(artist)
          .where(
            inArray(
              artist.name,
              newArtistEntries.map((a) => a.name)
            )
          )

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
    // Inserciones (ORDEN CRÍTICO)
    // =====================================================
    await this.upsertMusicBatch(uniqueMusics)
    await this.upsertMusicVersionsBatch(uniqueMusicVersions)
    await this.upsertAnimeMusicBatch(uniqueAnimeMusics)
    await this.upsertMusicResolutionsBatch(uniqueMusicResolutions)
    await this.upsertMusicArtistBatch(uniqueMusicArtists)
  },

  async saveArtist(artistResults: AnimeArtistProcessorResult[]): Promise<void> {
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

      const artistIds = await db
        .select({ id: artist.id, name: artist.name })
        .from(artist)
        .where(
          inArray(
            artist.name,
            artistMedia.map((am) => am.artistName)
          )
        )

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
      const allArtists = await db
        .select({ id: artist.id, name: artist.name })
        .from(artist)
        .where(
          inArray(
            artist.name,
            artistMedia.map((am) => am.artistName)
          )
        )

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

    await this.upsertArtistBatch(uniqueArtists)
    await this.upsertArtistMediaBatch(uniqueArtistMedias)
  },
}
