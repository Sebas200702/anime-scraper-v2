import { sql } from 'drizzle-orm'
import { db } from '../../libs/db.js'
import { chunk } from '../../utils/chunk.js'
import { unique } from '../../utils/deduplicate.js'

/**
 * Escrituras de la tabla `character` del pase de AniList. Nunca toca
 * `character.anilist_id`: el id real de AniList vive en `character_external`.
 */

export interface CharacterAttributes {
  characterId: number
  name: string
  nativeName: string | null
  description: string | null
  gender: string | null
  birthYear: number | null
  bloodType: string | null
  age: string | null
  favourites: number | null
}

/** Personajes solo-AniList (id 1e9 + id de AniList): se crean si faltan. */
export const insertAnilistOnlyCharacters = async (
  rows: CharacterAttributes[]
): Promise<void> => {
  for (const batch of chunk(
    unique(rows, (c) => `${c.characterId}`),
    1_000
  )) {
    await db.execute(sql`
      INSERT INTO character (
        mal_id, name, name_kanji, about, gender, blood_type, age, favorites,
        date_of_birth
      )
      SELECT v.id, v.name, v.native_name, v.description, v.gender, v.blood_type,
             v.age, v.favourites,
             CASE WHEN v.birth_year IS NOT NULL
               THEN make_date(v.birth_year, 1, 1) END
      FROM (VALUES ${sql.join(
        batch.map(
          (c) =>
            sql`(${c.characterId}::int, ${c.name}::text, ${c.nativeName}::text, ${c.description}::text, ${c.gender}::text, ${c.bloodType}::text, ${c.age}::text, ${c.favourites}::int, ${c.birthYear}::int)`
        ),
        sql`, `
      )}) AS v(id, name, native_name, description, gender, blood_type, age,
                favourites, birth_year)
      ON CONFLICT (mal_id) DO UPDATE SET
        name = COALESCE(NULLIF(EXCLUDED.name, ''), character.name),
        name_kanji = COALESCE(EXCLUDED.name_kanji, character.name_kanji),
        about = COALESCE(EXCLUDED.about, character.about)
    `)
  }
}

/** Atributos de AniList del personaje (AniList gana si trae valor; la fecha solo rellena). */
export const fillCharacterAttributes = async (
  rows: CharacterAttributes[]
): Promise<void> => {
  for (const batch of chunk(
    unique(rows, (c) => `${c.characterId}`),
    1_000
  )) {
    await db.execute(sql`
      UPDATE character c SET
        gender = COALESCE(v.gender, c.gender),
        blood_type = COALESCE(v.blood_type, c.blood_type),
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
            sql`(${c.characterId}::int, ${c.gender}::text, ${c.birthYear}::int, ${c.bloodType}::text, ${c.age}::text, ${c.favourites}::int)`
        ),
        sql`, `
      )}) AS v(character_id, gender, birth_year, blood_type, age, favorites)
      WHERE c.mal_id = v.character_id
    `)
  }
}
