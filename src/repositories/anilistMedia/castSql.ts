import { sql } from 'drizzle-orm'
import { db } from '../../libs/db.js'
import { chunk } from '../../utils/chunk.js'
import { ANILIST_ONLY_ID_BASE, type CastMember } from '../../utils/anilistCast.js'

/** SQL del reparto de AniList: lectura del reparto por medio y escrituras. */

const JUNCTIONS = {
  ANIME: { table: 'anime_character', column: 'anime_id' },
  MANGA: { table: 'manga_character', column: 'manga_id' },
} as const

/**
 * Reparto ya guardado de cada medio (character + character_external). Un
 * sintético sin fila externa conserva su anilist_id implícito (id − 1e9).
 */
export const loadCasts = async (
  mediaType: 'ANIME' | 'MANGA',
  mediaIds: number[]
): Promise<Map<number, CastMember[]>> => {
  const { table, column } = JUNCTIONS[mediaType]
  const casts = new Map<number, CastMember[]>()
  for (const batch of chunk([...new Set(mediaIds)], 1_000)) {
    const rows = (
      await db.execute(sql`
        SELECT j.${sql.raw(column)} AS media_id, c.mal_id AS character_id, c.name,
               COALESCE(ce.anilist_id, CASE WHEN c.mal_id >= ${ANILIST_ONLY_ID_BASE}::int
                 THEN c.mal_id - ${ANILIST_ONLY_ID_BASE}::int END) AS anilist_id
        FROM ${sql.raw(table)} j
        JOIN character c ON c.mal_id = j.character_id
        LEFT JOIN character_external ce ON ce.character_id = c.mal_id
        WHERE j.${sql.raw(column)} IN (${sql.join(
          batch.map((id) => sql`${id}::int`),
          sql`, `
        )})
      `)
    ).rows as unknown as {
      media_id: number
      character_id: number
      name: string | null
      anilist_id: number | null
    }[]
    for (const row of rows) {
      const list = casts.get(Number(row.media_id)) ?? []
      list.push({
        characterId: Number(row.character_id),
        name: row.name,
        anilistId: row.anilist_id === null ? null : Number(row.anilist_id),
      })
      casts.set(Number(row.media_id), list)
    }
  }
  return casts
}

/**
 * `character_external`: inserta la fila (mal_id NULL) y, si ya existía, pone
 * el anilist_id solo cuando está vacío. En ambos casos el anilist_id se omite
 * si otra fila ya lo tiene (índice único parcial): nunca falla.
 */
export const upsertCharacterExternal = async (
  rows: { characterId: number; anilistId: number | null }[]
): Promise<void> => {
  for (const batch of chunk(rows, 1_000)) {
    const values = sql.join(
      batch.map((r) => sql`(${r.characterId}::int, ${r.anilistId}::int)`),
      sql`, `
    )
    await db.execute(sql`
      INSERT INTO character_external (character_id, mal_id, anilist_id, created_at, updated_at)
      SELECT v.character_id, NULL,
             CASE WHEN NOT EXISTS (
               SELECT 1 FROM character_external o
               WHERE o.anilist_id = v.anilist_id AND o.character_id <> v.character_id
             ) THEN v.anilist_id END,
             now(), now()
      FROM (VALUES ${values}) AS v(character_id, anilist_id)
      ON CONFLICT DO NOTHING
    `)
    await db.execute(sql`
      UPDATE character_external ce SET anilist_id = v.anilist_id, updated_at = now()
      FROM (VALUES ${values}) AS v(character_id, anilist_id)
      WHERE ce.character_id = v.character_id
        AND ce.anilist_id IS NULL
        AND v.anilist_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM character_external o WHERE o.anilist_id = v.anilist_id
        )
    `)
  }
}

/** Retrato de AniList solo para personajes que aún no tienen poster. */
export const insertCharacterPosters = async (
  posters: { characterId: number; src: string }[]
): Promise<void> => {
  for (const batch of chunk(posters, 500)) {
    await db.execute(sql`
      INSERT INTO character_media (character_id, media_type, src, size, source, priority)
      SELECT v.id, 'poster', v.src, NULL, 'anilist', 30
      FROM (VALUES ${sql.join(
        batch.map((p) => sql`(${p.characterId}::int, ${p.src}::text)`),
        sql`, `
      )}) AS v(id, src)
      WHERE NOT EXISTS (
        SELECT 1 FROM character_media m
        WHERE m.character_id = v.id AND m.media_type = 'poster'
      )
      ON CONFLICT (character_id, media_type, src) DO NOTHING
    `)
  }
}
