/**
 * Forma del `payload` de una tarea (`ingest.task.payload`, jsonb).
 *
 * Los processors lo leen con `task.payload as { … }`, pero tiparlo aquí evita
 * el `unknown` genérico del jsonb y documenta los campos que existen hoy.
 */
export interface TaskPayload {
  /** Jikan: hidratación de un anime concreto. */
  animeId?: number
  /** Jikan: página del listado. */
  page?: number
  /** Kitsu: episodios de un anime. */
  kitsu_id?: number | null
  /** Kitsu: id interno de anime (nuestro malId). */
  anime_id?: number
  /** AnimeThemes: slug del anime/artista. */
  slug?: string
  /** Mapping (Kitsu/TVDB): datos de búsqueda. */
  title?: string
  title_english?: string | null
  title_japanese?: string | null
  title_synonyms?: string[] | null
  year?: number | null
  type?: string | null
  /** TVDB: id de serie. */
  tvdb_id?: number | null

  [key: string]: unknown
}
