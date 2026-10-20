import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { character } from '../schemas/character.js'
import { staff } from '../schemas/staff.js'
import {
  animeCharacter,
  animeStaff,
  animeRelatedAnime,
} from '../schemas/animeRelations.js'
import {
  mangaCharacter,
  mangaStaff,
  mangaRelation,
} from '../schemas/mangaRelations.js'
import { characterVoiceActor } from '../schemas/characterRelations.js'
import {
  animeExternalLink,
  mangaExternalLink,
} from '../schemas/externalLink.js'
import { anime } from '../schemas/anime.js'
import { manga } from '../schemas/manga.js'
import { batchUpsert } from '../shared/batchUpsert.js'
import { chunk } from '../utils/chunk.js'
import { unique } from '../utils/deduplicate.js'
import { filterByExistingFk } from '../shared/fkFilter.js'
import { normalizeText } from '../utils/normalize.js'
import type { AniListMediaProcessorResult } from '../processors/anilistMedia.js'

/**
 * Indices nombre → id de MAL para cruzar el reparto de AniList con el de MAL.
 *
 * AniList no publica el id de MAL de sus personajes (solo el de los medios),
 * así que el cruce es por **nombre normalizado**. El índice se cachea en el
 * módulo: el repositorio vive en el proceso del servicio, no se recarga por
 * lote.
 */
let nameIndex: {
  characters: Map<string, number>
  staff: Map<string, number>
} | null = null

const loadNameIndex = async (): Promise<NonNullable<typeof nameIndex>> => {
  if (nameIndex) return nameIndex
  const characters = new Map<string, number>()
  const staff = new Map<string, number>()

  for (const row of (
    await db.execute(
      `SELECT mal_id, name, name_kanji FROM character WHERE name NOT LIKE 'Personaje %'`
    )
  ).rows as unknown as {
    mal_id: number
    name: string
    name_kanji: string | null
  }[]) {
    for (const key of [row.name, row.name_kanji]) {
      const norm = normalizeText(key)
      if (norm && !characters.has(norm)) characters.set(norm, row.mal_id)
    }
  }

  for (const row of (await db.execute(`SELECT mal_id, name FROM staff`))
    .rows as unknown as { mal_id: number; name: string }[]) {
    const norm = normalizeText(row.name)
    if (norm && !staff.has(norm)) staff.set(norm, row.mal_id)
  }

  nameIndex = { characters, staff }
  return nameIndex
}

/** Invalida el índice de nombres (tras una tanda grande de `malPerson`). */
export const invalidateNameIndex = (): void => {
  nameIndex = null
}

export const anilistMediaRepository = {
  async saveAnilistMedia(
    results: AniListMediaProcessorResult[]
  ): Promise<number> {
    const index = await loadNameIndex()
    const animeResults = results.filter(
      (r) => r.mediaType === 'ANIME' && r.mediaId
    )
    const mangaResults = results.filter(
      (r) => r.mediaType === 'MANGA' && r.mediaId
    )

    // 1) Staff: se cruza con el `staff` de MAL por nombre.
    for (const [rows, junction, mediaTable, mediaColumn] of [
      [animeResults, animeStaff, anime, 'animeId'],
      [mangaResults, mangaStaff, manga, 'mangaId'],
    ] as const) {
      const links = unique(
        rows.flatMap((r) =>
          r.staff
            .map((s) => ({
              mediaId: r.mediaId as number,
              staffId: index.staff.get(normalizeText(s.name)),
              role: s.roleNote ? `${s.role} (${s.roleNote})` : s.role,
              anilistId: s.anilistId,
              name: s.name,
            }))
            .filter((l) => Boolean(l.staffId))
        ),
        (l) => `${l.mediaId}:${l.staffId}:${l.role}`
      )
      if (links.length === 0) continue
      await batchUpsert(
        junction as typeof animeStaff,
        links.map((l) => ({
          [mediaColumn]: l.mediaId,
          staffId: l.staffId as number,
          role: l.role,
        })) as never,
        3,
        mediaColumn === 'animeId' ? 'anime-staff' : 'manga-staff'
      )
    }

    // 2) Personajes: id de AniList + cruce por nombre con el personaje de MAL.
    const characterLinks: {
      mediaId: number
      characterId: number
      role: string
      anilistId: number
      gender: string | null
      birthYear: number | null
      bloodType: string | null
      height: number | null
      weight: number | null
      age: string | null
      favourites: number | null
    }[] = []
    const voiceActors: {
      characterId: number
      staffId: number
      language: string
    }[] = []

    for (const r of [...animeResults, ...mangaResults]) {
      for (const c of r.characters) {
        const characterId = index.characters.get(normalizeText(c.name))
        if (!characterId) continue
        characterLinks.push({
          mediaId: r.mediaId as number,
          characterId,
          role: c.role,
          anilistId: c.anilistId,
          gender: c.gender,
          birthYear: c.birthYear,
          bloodType: c.bloodType,
          height: c.height,
          weight: c.weight,
          age: c.age,
          favourites: c.favourites,
        })
        for (const va of c.voiceActors) {
          const staffId = index.staff.get(normalizeText(va.name))
          if (!staffId) continue
          voiceActors.push({
            characterId,
            staffId,
            language: 'Japanese',
          })
        }
      }
    }

    if (characterLinks.length > 0) {
      // 2a) El id de AniList y los atributos del personaje.
      for (const batch of chunk(
        unique(characterLinks, (c) => `${c.characterId}`),
        1_000
      )) {
        await db.execute(sql`
          UPDATE character c SET
            anilist_id = v.anilist_id,
            gender = COALESCE(v.gender, c.gender),
            blood_type = COALESCE(v.blood_type, c.blood_type),
            height = COALESCE(v.height, c.height),
            weight = COALESCE(v.weight, c.weight),
            age = COALESCE(v.age, c.age),
            favorites = COALESCE(v.favorites, c.favorites),
            date_of_birth = COALESCE(
              c.date_of_birth,
              CASE WHEN v.birth_year IS NOT NULL
                THEN make_date(v.birth_year, 1, 1)
              END
            )
          FROM (VALUES ${sql.join(
            batch.map(
              (c) =>
                sql`(${c.characterId}::int, ${c.anilistId}::int, ${c.gender}::text, ${c.birthYear}::int, ${c.bloodType}::text, ${c.height}::int, ${c.weight}::int, ${c.age}::text, ${c.favourites}::int)`
            ),
            sql`, `
          )}) AS v(character_id, anilist_id, gender, birth_year, blood_type, height, weight, age, favorites)
          WHERE c.mal_id = v.character_id
        `)
      }

      // 2b) Los vínculos anime ↔ personaje y manga ↔ personaje.
      const animeChars = unique(
        characterLinks
          .filter((c) => animeResults.some((r) => r.mediaId === c.mediaId))
          .map((c) => ({
            animeId: c.mediaId,
            characterId: c.characterId,
            role: c.role,
          })),
        (c) => `${c.animeId}:${c.characterId}:${c.role}`
      )
      await batchUpsert(animeCharacter, animeChars, 3, 'anime-character')

      const mangaChars = unique(
        characterLinks
          .filter((c) => mangaResults.some((r) => r.mediaId === c.mediaId))
          .map((c) => ({
            mangaId: c.mediaId,
            characterId: c.characterId,
            role: c.role,
          })),
        (c) => `${c.mangaId}:${c.characterId}:${c.role}`
      )
      await batchUpsert(mangaCharacter, mangaChars, 3, 'manga-character')

      // 2c) Las voces: el actor de voz es `staff` (seiyuu).
      await batchUpsert(
        characterVoiceActor,
        unique(
          voiceActors,
          (v) => `${v.characterId}:${v.staffId}:${v.language}`
        ),
        3,
        'character-voice-actor'
      )
    }

    // 3) Relaciones (con el id de MAL del medio relacionado).
    const animeRelations = unique(
      animeResults.flatMap((r) =>
        r.relations.map((rel) => ({
          animeId: r.mediaId as number,
          relatedAnimeId: rel.relatedMalId,
          relationType: rel.relationType,
        }))
      ),
      (r) => `${r.animeId}:${r.relatedAnimeId}:${r.relationType}`
    )
    const validAnimeRelations = await filterByExistingFk(
      animeRelations,
      (r) => r.relatedAnimeId,
      anime,
      anime.malId,
      false
    )
    await batchUpsert(
      animeRelatedAnime,
      validAnimeRelations,
      3,
      'anime-relation'
    )

    const mangaRelations = unique(
      mangaResults.flatMap((r) =>
        r.relations.map((rel) => ({
          mangaId: r.mediaId as number,
          relatedMangaId: rel.relatedMalId,
          relationType: rel.relationType,
        }))
      ),
      (r) => `${r.mangaId}:${r.relatedMangaId}:${r.relationType}`
    )
    const validMangaRelations = await filterByExistingFk(
      mangaRelations,
      (r) => r.relatedMangaId,
      manga,
      manga.malId,
      false
    )
    await batchUpsert(mangaRelation, validMangaRelations, 3, 'manga-relation')

    // 4) Enlaces externos.
    const animeLinks = unique(
      animeResults.flatMap((r) =>
        r.externalLinks.map((l) => ({
          animeId: r.mediaId as number,
          site: l.site,
          url: l.url,
          type: l.type,
        }))
      ),
      (l) => `${l.animeId}:${l.url}`
    )
    for (const batch of chunk(animeLinks, 500)) {
      await db.execute(sql`
        INSERT INTO anime_external_link (anime_id, site, url, type)
        SELECT v.anime_id, v.site, v.url, v.type
        FROM (VALUES ${sql.join(
          batch.map(
            (l) =>
              sql`(${l.animeId}::int, ${l.site}::text, ${l.url}::text, ${l.type}::text)`
          ),
          sql`, `
        )}) AS v(anime_id, site, url, type)
        ON CONFLICT (anime_id, url) DO UPDATE SET
          site = EXCLUDED.site, type = EXCLUDED.type
      `)
    }

    const mangaLinks = unique(
      mangaResults.flatMap((r) =>
        r.externalLinks.map((l) => ({
          mangaId: r.mediaId as number,
          site: l.site,
          url: l.url,
          type: l.type,
        }))
      ),
      (l) => `${l.mangaId}:${l.url}`
    )
    for (const batch of chunk(mangaLinks, 500)) {
      await db.execute(sql`
        INSERT INTO manga_external_link (manga_id, site, url, type)
        SELECT v.manga_id, v.site, v.url, v.type
        FROM (VALUES ${sql.join(
          batch.map(
            (l) =>
              sql`(${l.mangaId}::int, ${l.site}::text, ${l.url}::text, ${l.type}::text)`
          ),
          sql`, `
        )}) AS v(manga_id, site, url, type)
        ON CONFLICT (manga_id, url) DO UPDATE SET
          site = EXCLUDED.site, type = EXCLUDED.type
      `)
    }

    return results.length
  },
}
