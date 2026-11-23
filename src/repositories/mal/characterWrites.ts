import { sql, type SQL } from 'drizzle-orm'
import { nativeNameOrNull } from '../../utils/characterName.js'

/**
 * SQL de los escritores de personajes de MAL (página de personajes, ficha de
 * persona y ficha HTML del anime). Puro: solo construye sentencias, así se
 * prueba sin base de datos.
 */

/**
 * `name_kanji` solo guarda un nombre nativo (no ASCII, S4): el nuevo si lo hay;
 * si no, el existente solo cuando es nativo (UTF-8 multibyte), y el romaji que
 * escribía el parser antiguo se limpia. Nunca se borra un nativo real.
 */
const NAME_KANJI_MERGE = sql.raw(
  `name_kanji = CASE WHEN EXCLUDED.name_kanji IS NOT NULL THEN EXCLUDED.name_kanji
     WHEN octet_length(character.name_kanji) > char_length(character.name_kanji)
     THEN character.name_kanji ELSE NULL END`
)

/** Personajes de la página `/anime/{id}/characters`. */
export const malCharacterUpsertSql = (
  rows: { characterId: number; name: string; nativeName: string | null }[]
): SQL => sql`
  INSERT INTO character (mal_id, name, name_kanji)
  SELECT v.id, v.name, v.native_name
  FROM (VALUES ${sql.join(
    rows.map(
      (c) =>
        sql`(${c.characterId}::int, ${c.name}::text, ${nativeNameOrNull(c.nativeName)}::text)`
    ),
    sql`, `
  )}) AS v(id, name, native_name)
  ON CONFLICT (mal_id) DO UPDATE SET
    name = COALESCE(NULLIF(EXCLUDED.name, ''), character.name),
    ${NAME_KANJI_MERGE}
`

/** Personajes de la ficha de persona de la API v2 de MAL. */
export const malPersonCharacterUpsertSql = (
  rows: {
    id: number
    name: string
    nativeName: string | null
    about: string | null
  }[]
): SQL => sql`
  INSERT INTO character (mal_id, name, name_kanji, about)
  SELECT v.id, v.name, v.native_name, v.about
  FROM (VALUES ${sql.join(
    rows.map(
      (r) =>
        sql`(${r.id}::int, ${r.name}::text, ${nativeNameOrNull(r.nativeName)}::text, ${r.about}::text)`
    ),
    sql`, `
  )}) AS v(id, name, native_name, about)
  ON CONFLICT (mal_id) DO UPDATE SET
    name = CASE
      WHEN character.name = 'Personaje ' || EXCLUDED.mal_id::text
        THEN EXCLUDED.name
      ELSE character.name
    END,
    ${NAME_KANJI_MERGE},
    about = COALESCE(EXCLUDED.about, character.about)
`

/**
 * `character_external.mal_id` de personajes de MAL (S8). En MAL el id interno
 * del personaje **es** su id de MAL. Solo filas cuyo `character` existe (FK) y
 * cuyo mal_id no tiene ya otro personaje (índice único parcial); un mal_id ya
 * registrado nunca se reemplaza.
 */
export const characterExternalMalSql = (ids: number[]): SQL | null => {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return null
  return sql`
    INSERT INTO character_external (character_id, mal_id, created_at, updated_at)
    SELECT v.id, v.id, now(), now()
    FROM (VALUES ${sql.join(
      unique.map((id) => sql`(${id}::int)`),
      sql`, `
    )}) AS v(id)
    JOIN character c ON c.mal_id = v.id
    WHERE NOT EXISTS (SELECT 1 FROM character_external ce WHERE ce.mal_id = v.id AND ce.character_id <> v.id)
    ON CONFLICT (character_id) DO UPDATE SET
      mal_id = COALESCE(character_external.mal_id, EXCLUDED.mal_id),
      updated_at = EXCLUDED.updated_at
  `
}

/**
 * Retratos de MAL de personajes (`character_media`): poster, fuente `mal`,
 * prioridad 20. Nunca reemplaza una fila existente.
 */
export const malCharacterPortraitSql = (
  rows: { id: number; src: string }[]
): SQL | null => {
  if (rows.length === 0) return null
  return sql`
        INSERT INTO character_media (character_id, media_type, src, size, source, priority)
        SELECT v.id, 'poster', v.src, NULL, 'mal', 20
        FROM (VALUES ${sql.join(
          rows.map((c) => sql`(${c.id}::int, ${c.src}::text)`),
          sql`, `
        )}) AS v(id, src)
        ON CONFLICT (character_id, media_type, src) DO NOTHING
      `
}

/**
 * Reparto de un manga desde MAL (`manga_character`). Solo inserta: nunca borra
 * ni pisa los vínculos de AniList. Ids reales de MAL, sin cruce por nombre;
 * solo filas cuyo manga y personaje existen (FK).
 */
export const mangaCharacterLinkSql = (
  rows: { mangaId: number; characterId: number; role: string }[]
): SQL | null => {
  if (rows.length === 0) return null
  return sql`
    INSERT INTO manga_character (manga_id, character_id, role)
    SELECT v.manga_id, v.character_id, v.role
    FROM (VALUES ${sql.join(
      rows.map(
        (r) => sql`(${r.mangaId}::int, ${r.characterId}::int, ${r.role}::text)`
      ),
      sql`, `
    )}) AS v(manga_id, character_id, role)
    JOIN manga m ON m.mal_id = v.manga_id
    JOIN character c ON c.mal_id = v.character_id
    ON CONFLICT DO NOTHING
  `
}
