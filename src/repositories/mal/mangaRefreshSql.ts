import { sql, type SQL } from 'drizzle-orm'
import type { MalMangaProcessorResult } from '../../processors/malManga.js'

type Sheet = MalMangaProcessorResult
type MangaRow = Sheet['manga']

/** Solo se completan donde la DB está en NULL (L16). */
const FILL_ONLY = [
  'title_english',
  'title_japanese',
  'synopsis',
  'year',
  'published_from',
  'published_to',
] as const
/** Volátiles: se pisan solo con un valor de MAL no nulo (L16). */
const VOLATILE = [
  'status',
  'chapters',
  'volumes',
  'score',
  'scored_by',
  'members',
  'popularity_rank',
] as const
const COLUMNS = [...FILL_ONLY, ...VOLATILE]
// MAL manda `""` en títulos alternativos vacíos: no convierte NULL en ''.
const TEXT_FILL = ['title_english', 'title_japanese']
const next = (col: string) =>
  (FILL_ONLY as readonly string[]).includes(col)
    ? `COALESCE(m.${col}, ${TEXT_FILL.includes(col) ? `NULLIF(v.${col}, '')` : `v.${col}`})`
    : `COALESCE(v.${col}, m.${col})`

/**
 * Refresco de manga EXISTENTES desde la ficha del ranking (T10, L16), en una
 * sola sentencia por lote. `title`, `type` (NOT NULL: "solo si es NULL" nunca
 * aplica, y `processMalManga` rellena `'manga'` cuando MAL no lo trae),
 * `background`, `source`, `serialization`, `ranking` y `favorites` no se
 * tocan. El `IS DISTINCT FROM` deja fuera las filas sin cambios: una segunda
 * pasada no reescribe nada (ni tuplas muertas ni locks de más).
 */
export const refreshKnownMangaSql = (rows: MangaRow[]): SQL => {
  const values = sql.join(
    rows.map(
      (m) =>
        sql`(${m.malId}::int, ${m.titleEnglish}::text, ${m.titleJapanese}::text, ${m.synopsis}::text, ${m.year}::int, ${m.publishedFrom}::timestamptz, ${m.publishedTo}::timestamptz, ${m.status}::text, NULLIF(${m.chapters}::int, 0), NULLIF(${m.volumes}::int, 0), ${m.score}::real, ${m.scoredBy}::int, ${m.members}::int, ${m.popularityRank}::int)`
    ),
    sql`, `
  )
  return sql`
    UPDATE manga AS m SET ${sql.raw(COLUMNS.map((c) => `${c} = ${next(c)}`).join(', '))}
    FROM (VALUES ${values}) AS v(mal_id, ${sql.raw(COLUMNS.join(', '))})
    WHERE m.mal_id = v.mal_id
      AND (${sql.raw(COLUMNS.map((c) => `m.${c}`).join(', '))})
        IS DISTINCT FROM (${sql.raw(COLUMNS.map(next).join(', '))})
  `
}

/**
 * Portada solo para el manga que no tiene ninguna de ese tipo: todas las
 * tallas entran juntas (el NOT EXISTS ve la foto previa a la sentencia) y uno
 * que ya tiene portada no recibe una segunda. Misma forma que `saveMalManga`.
 */
export const addMissingCoversSql = (media: Sheet['media']): SQL => sql`
  INSERT INTO manga_media (manga_id, media_type, src, size, source, priority)
  SELECT v.manga_id, v.media_type, v.src, v.size, 'mal', 20
  FROM (VALUES ${sql.join(
    media.map(
      (c) =>
        sql`(${c.mangaId}::int, ${c.mediaType}::text, ${c.src}::text, ${c.size}::text)`
    ),
    sql`, `
  )}) AS v(manga_id, media_type, src, size)
  JOIN manga m ON m.mal_id = v.manga_id
  WHERE NOT EXISTS (
    SELECT 1 FROM manga_media e
    WHERE e.manga_id = v.manga_id AND e.media_type = v.media_type
  )
  ON CONFLICT (manga_id, media_type, src) DO NOTHING
`

/**
 * Catálogo de géneros como en `saveMalManga` (el nombre sigue a MAL), pero sin
 * reescribir la fila cuando el nombre no cambió.
 */
export const upsertGenresSql = (genres: Sheet['genres']): SQL => sql`
  INSERT INTO genre (mal_id, name)
  SELECT v.id, v.name
  FROM (VALUES ${sql.join(
    genres.map((g) => sql`(${g.genreId}::int, ${g.name}::text)`),
    sql`, `
  )}) AS v(id, name)
  ON CONFLICT (mal_id) DO UPDATE SET name = EXCLUDED.name
    WHERE genre.name IS DISTINCT FROM EXCLUDED.name
`

/** Géneros solo para el manga que no tiene ninguno. */
export const addMissingGenresSql = (genres: Sheet['genres']): SQL => sql`
  INSERT INTO manga_genre (manga_id, genre_id)
  SELECT v.manga_id, v.genre_id
  FROM (VALUES ${sql.join(
    genres.map((g) => sql`(${g.mangaId}::int, ${g.genreId}::int)`),
    sql`, `
  )}) AS v(manga_id, genre_id)
  JOIN manga m ON m.mal_id = v.manga_id
  JOIN genre g ON g.mal_id = v.genre_id
  WHERE NOT EXISTS (
    SELECT 1 FROM manga_genre e WHERE e.manga_id = v.manga_id
  )
  ON CONFLICT DO NOTHING
`

/** Sinónimos solo para el manga que no tiene ninguno. */
export const addMissingSynonymsSql = (
  synonyms: { mangaId: number; title: string }[]
): SQL => sql`
  INSERT INTO manga_title_synonym (manga_id, title)
  SELECT v.manga_id, v.title
  FROM (VALUES ${sql.join(
    synonyms.map((s) => sql`(${s.mangaId}::int, ${s.title}::text)`),
    sql`, `
  )}) AS v(manga_id, title)
  JOIN manga m ON m.mal_id = v.manga_id
  WHERE NOT EXISTS (
    SELECT 1 FROM manga_title_synonym e WHERE e.manga_id = v.manga_id
  )
  ON CONFLICT DO NOTHING
`
