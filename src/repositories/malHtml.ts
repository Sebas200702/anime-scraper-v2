import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { anime } from '../schemas/anime.js'
import { character } from '../schemas/character.js'
import { producer, producerTitle } from '../schemas/producer.js'
import { staff } from '../schemas/staff.js'
import {
  animeCharacter,
  animeStaff,
  animeMusic,
  animeRelatedAnime,
  animeProducer,
  animeGenre,
  animeTheme,
  animeDemographic,
} from '../schemas/animeRelations.js'
import { characterVoiceActor } from '../schemas/characterRelations.js'
import {
  genre,
  theme,
  demographic,
} from '../schemas/animeTaxonomy.js'
import { characterMedia, staffMedia } from '../schemas/media.js'
import { music } from '../schemas/music.js'
import { musicArtist } from '../schemas/musicRelations.js'
import { musicStream } from '../schemas/musicStream.js'
import { batchUpsert } from '../shared/batchUpsert.js'
import { chunk } from '../utils/chunk.js'
import { unique } from '../utils/deduplicate.js'
import { normalizeText } from '../utils/normalize.js'
import { malMusicId, normalizeSongTitle } from '../shared/malMusicIds.js'
import { resolveArtistIds } from '../shared/artistResolver.js'
import { filterByExistingFk } from '../shared/fkFilter.js'
import type {
  MalCharactersProcessorResult,
  MalThemeRow,
  NewAnimeMusic,
  NewMusic,
} from '../types/index.js'

/**
 * Guarda personajes, staff y seiyuus con ids MAL.
 *
 * Orden obligatorio por FK: primero los padres (`character`, `staff` —incluidos
 * los seiyuus—), luego las junctions y al final la media. Todo idempotente.
 */
export const malHtmlRepository = {
  async saveMalCharacters(
    results: MalCharactersProcessorResult[]
  ): Promise<number> {
    const characters = results.flatMap((r) => r.characters)
    const staffRows = [...results.flatMap((r) => r.staff)]
    const voiceActorStaff = results.flatMap((r) => r.voiceActorStaff)
    const animeCharacters = results.flatMap((r) => r.animeCharacters)
    const animeStaffRows = results.flatMap((r) => r.animeStaff)
    const voiceActors = results.flatMap((r) => r.characterVoiceActors)
    const favorites = results.flatMap((r) => r.animeFavorites ?? [])
    const relations = results.flatMap((r) => r.animeRelations ?? [])
    const taxonomy = results.flatMap((r) => r.animeTaxonomy ?? [])
    const companies = results.flatMap((r) => r.animeCompanies ?? [])
    const charMedia = results.flatMap((r) => r.characterMedia)
    const staffMediaRows = results.flatMap((r) => r.staffMedia)

    // 0) Favoritos del anime (solo en la ficha HTML: la API no los da).
    for (const batch of chunk(
      unique(favorites, (f) => `${f.animeId}`),
      500
    )) {
      await db.execute(sql`
        UPDATE anime a
        SET favorites = v.favorites
        FROM (VALUES ${sql.join(
          batch.map(
            (f) => sql`(${f.animeId}::int, ${f.favorites}::int)`
          ),
          sql`, `
        )}) AS v(anime_id, favorites)
        WHERE a.mal_id = v.anime_id
      `)
    }

    // 0b) Relaciones de MAL + compañías con rol (solo en el HTML).
    const uRelations = unique(
      relations,
      (r) => `${r.animeId}:${r.relatedAnimeId}:${r.relationType}`
    )
    // La junction exige que el anime relacionado esté en el catálogo.
    const validRelations = await filterByExistingFk(
      uRelations,
      (r) => r.relatedAnimeId,
      anime,
      anime.malId,
      false
    )
    if (validRelations.length > 0) {
      await batchUpsert(
        animeRelatedAnime,
        validRelations.map((r) => ({
          animeId: r.animeId,
          relationType: r.relationType,
          relatedAnimeId: r.relatedAnimeId,
        })),
        3,
        'anime-relation'
      )
    }

    const uCompanies = unique(
      companies,
      (c) => `${c.animeId}:${c.producerId}:${c.role}`
    )
    const uProducerIds = unique(companies, (c) => `${c.producerId}`)
    if (uCompanies.length > 0) {
      await batchUpsert(
        producer,
        uProducerIds.map((c) => ({ malId: c.producerId })),
        1,
        'producer'
      )
      await batchUpsert(
        producerTitle,
        unique(
          companies.map((c) => ({
            producerId: c.producerId,
            type: 'Default',
            title: c.name,
          })),
          (t) => `${t.producerId}:${t.title}`
        ),
        3,
        'producer-title'
      )
      await batchUpsert(
        animeProducer,
        uCompanies.map((c) => ({
          animeId: c.animeId,
          producerId: c.producerId,
          role: c.role,
        })),
        3,
        'anime-producer'
      )
    }

    // 0c) Taxonomía exacta de MAL (géneros/temas/demográficas con id nativo).
    const taxGenres = taxonomy.flatMap((t2) => t2.genres)
    const taxThemes = taxonomy.flatMap((t2) => t2.themes)
    const taxDemos = taxonomy.flatMap((t2) => t2.demographics)
    if (taxonomy.length > 0) {
      await batchUpsert(
        genre,
        unique(taxGenres, (g) => `${g.genreId}`).map((g) => ({
          malId: g.genreId,
          name: g.name,
        })),
        2,
        'genre'
      )
      await batchUpsert(
        theme,
        unique(taxThemes, (g) => `${g.themeId}`).map((g) => ({
          malId: g.themeId,
          name: g.name,
        })),
        2,
        'theme'
      )
      await batchUpsert(
        demographic,
        unique(taxDemos, (g) => `${g.demographicId}`).map((g) => ({
          malId: g.demographicId,
          name: g.name,
        })),
        2,
        'demographic'
      )
      await batchUpsert(
        animeGenre,
        unique(taxGenres, (g) => `${g.animeId}:${g.genreId}`).map((g) => ({
          animeId: g.animeId,
          genreId: g.genreId,
        })),
        2,
        'anime-genre'
      )
      await batchUpsert(
        animeTheme,
        unique(taxThemes, (g) => `${g.animeId}:${g.themeId}`).map((g) => ({
          animeId: g.animeId,
          themeId: g.themeId,
        })),
        2,
        'anime-theme'
      )
      await batchUpsert(
        animeDemographic,
        unique(taxDemos, (g) => `${g.animeId}:${g.demographicId}`).map((g) => ({
          animeId: g.animeId,
          demographicId: g.demographicId,
        })),
        2,
        'anime-demographic'
      )
    }

    // 1) Padres (los seiyuus también existen como staff).
    await batchUpsert(
      character,
      unique(characters, (c) => c.malId),
      2,
      'character'
    )
    await batchUpsert(
      staff,
      unique([...staffRows, ...voiceActorStaff], (s) => s.malId),
      2,
      'staff'
    )

    // 2) Junctions.
    const uAnimeCharacters = unique(
      animeCharacters,
      (c) => `${c.animeId}:${c.characterId}:${c.role}`
    )
    const uAnimeStaff = unique(
      animeStaffRows,
      (s) => `${s.animeId}:${s.staffId}:${s.role}`
    )
    const uVas = unique(
      voiceActors,
      (v) => `${v.characterId}:${v.staffId}:${v.language}`
    )
    await batchUpsert(animeCharacter, uAnimeCharacters, 3, 'anime-character')
    await batchUpsert(animeStaff, uAnimeStaff, 3, 'anime-staff')
    await batchUpsert(characterVoiceActor, uVas, 3, 'character-voice-actor')

    // 3) Media (retratos): misma identidad natural que el resto.
    const uCharMedia = unique(charMedia, (m) => `${m.entityId}:${m.src}`).map(
      (m) => ({
        characterId: m.entityId,
        mediaType: m.mediaType,
        src: m.src,
        size: null,
        source: 'mal',
        priority: 25,
      })
    )
    const uStaffMedia = unique(
      staffMediaRows,
      (m) => `${m.entityId}:${m.src}`
    ).map((m) => ({
      staffId: m.entityId,
      mediaType: m.mediaType,
      src: m.src,
      size: null,
      source: 'mal',
      priority: 25,
    }))
    if (uCharMedia.length > 0) {
      await db.insert(characterMedia).values(uCharMedia).onConflictDoNothing()
    }
    if (uStaffMedia.length > 0) {
      await db.insert(staffMedia).values(uStaffMedia).onConflictDoNothing()
    }

    return (
      favorites.length +
      taxonomy.length +
      validRelations.length +
      uCompanies.length +
      characters.length +
      uAnimeCharacters.length +
      uAnimeStaff.length +
      uVas.length +
      uCharMedia.length +
      uStaffMedia.length +
      (await this.saveThemes(results.flatMap((r) => r.themes ?? [])))
    )
  },

  /**
   * Canciones de MAL: `music` + `anime_music` (con nº de tema y rango de
   * episodios) + `music_artist` + `music_stream` (Spotify/Apple/Amazon).
   *
   * **AnimeThemes se anexa, no se duplica**: si el anime ya tiene una canción
   * con el mismo tipo y título normalizado, los metadatos de MAL se escriben
   * sobre esa fila (que conserva su vídeo/audio reproducible); si no existe, se
   * crea con el id reservado de MAL y queda sin media (hueco a cubrir por otra
   * fuente más adelante).
   */
  async saveThemes(themes: MalThemeRow[]): Promise<number> {
    if (themes.length === 0) return 0

    const animeIds = [...new Set(themes.map((t) => t.animeId))]
    // Índice de lo que ya hay para estos anime: así una canción de AnimeThemes
    // recibe los metadatos de MAL en vez de crear una segunda fila idéntica.
    const existing = new Map<string, number>()
    for (const batch of chunk(animeIds, 500)) {
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
      // Ordenado por media desc: si el mismo tema existe en dos fuentes, gana la
      // fila **con archivo** (AnimeThemes) y los metadatos de MAL se anexan ahí.
      for (const row of rows.rows as unknown as {
        anime_id: number
        id: number
        title: string | null
        type: string
      }[]) {
        const key = `${row.anime_id}|${row.type}|${normalizeSongTitle(row.title)}`
        if (!existing.has(key)) existing.set(key, row.id)
      }
    }

    const keyOf = (t: MalThemeRow) =>
      `${t.animeId}|${t.kind}|${normalizeSongTitle(t.title)}`

    const newMusic = new Map<number, NewMusic>()
    const links: NewAnimeMusic[] = []
    const streams: {
      musicId: number
      provider: string
      url: string
      externalId: string | null
      country: string | null
    }[] = []
    const credits: { musicId: number; artistName: string }[] = []

    for (const theme of themes) {
      if (theme.malSongId === null) continue
      const key = keyOf(theme)
      let musicId = existing.get(key)
      if (musicId === undefined) {
        musicId = malMusicId(theme.malSongId)
        existing.set(key, musicId)
        if (!newMusic.has(musicId)) {
          newMusic.set(musicId, {
            id: musicId,
            title: theme.title,
            type: theme.kind,
          })
        }
      }
      links.push({
        animeId: theme.animeId,
        musicId,
        sequence: theme.sequence,
        episodes: theme.episodes,
      })
      for (const stream of theme.streams) {
        streams.push({ musicId, ...stream })
      }
      if (theme.artist) credits.push({ musicId, artistName: theme.artist })
    }

    const uMusic = [...newMusic.values()]
    const uLinks = unique(links, (l) => `${l.animeId}:${l.musicId}`)
    const uStreams = unique(streams, (s) => `${s.musicId}:${s.provider}`)
    const uCredits = unique(credits, (c) => `${c.musicId}:${c.artistName}`)

    await db.transaction(async (tx) => {
      for (const batch of chunk(uMusic, 200)) {
        await tx
          .insert(music)
          .values(batch)
          .onConflictDoUpdate({
            target: music.id,
            set: { title: sql`excluded.title`, type: sql`excluded.type` },
          })
      }

      for (const batch of chunk(uLinks, 200)) {
        await tx
          .insert(animeMusic)
          .values(batch)
          .onConflictDoUpdate({
            target: [animeMusic.animeId, animeMusic.musicId],
            // COALESCE: un anime que solo tenía el vínculo (sin metadatos)
            // conserva lo que ya estuviera cuando esta corrida no lo traiga.
            set: {
              sequence: sql`COALESCE(excluded.sequence, "anime_music"."sequence")`,
              episodes: sql`COALESCE(excluded.episodes, "anime_music"."episodes")`,
            },
          })
      }

      for (const batch of chunk(uStreams, 100)) {
        await tx
          .insert(musicStream)
          .values(batch)
          .onConflictDoUpdate({
            target: [musicStream.musicId, musicStream.provider],
            set: {
              url: sql`excluded.url`,
              externalId: sql`excluded.external_id`,
              country: sql`excluded.country`,
            },
          })
      }
    })

    if (uCredits.length > 0) {
      const artistMap = await resolveArtistIds(
        uCredits.map((c) => c.artistName)
      )
      const rows = uCredits
        .map((c) => {
          const artistId = artistMap.get(normalizeText(c.artistName))
          return artistId ? { musicId: c.musicId, artistId } : null
        })
        .filter((r): r is { musicId: number; artistId: number } => r !== null)
      const uRows = unique(rows, (r) => `${r.musicId}:${r.artistId}`)
      for (const batch of chunk(uRows, 500)) {
        await db.insert(musicArtist).values(batch).onConflictDoNothing()
      }
    }

    return uMusic.length + uLinks.length + uStreams.length + uCredits.length
  },
}
