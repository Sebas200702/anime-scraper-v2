import { sql } from 'drizzle-orm'
import { MEDIA_SOURCE_PRIORITY } from '../config/sources.js'
import { db } from '../libs/db.js'
import type { MangaLink } from '../types/anilistApi.js'

const values = (links: MangaLink[]) =>
  sql.join(
    links.map(
      (l) =>
        sql`(${l.malId}::int, ${l.anilistId}::int, ${l.country}::text, ${l.banner}::text)`
    ),
    sql`, `
  )

/**
 * Escrituras del enlace AniList de manga (S6, L14). Todo solo-relleno: no
 * toca estado, géneros, títulos ni nada que mande MAL.
 */
export const anilistMangaLinkRepository = {
  /** Manga sin `anilist_id` (NULL o sin fila externa) tras `after`, por `mal_id`. */
  async unlinkedMangaIds(after: number, limit: number): Promise<number[]> {
    const rows = (
      await db.execute(sql`
        SELECT m.mal_id
        FROM manga m
        LEFT JOIN manga_external_ids x ON x.manga_id = m.mal_id
        WHERE x.anilist_id IS NULL AND m.mal_id > ${after}
        ORDER BY m.mal_id
        LIMIT ${limit}
      `)
    ).rows as { mal_id: number }[]
    return rows.map((r) => Number(r.mal_id))
  },

  /**
   * (1) `anilist_id` solo donde es NULL y si ningún otro manga ya lo usa
   * (conflicto = se salta ese manga, el lote sigue); (2) país y (3) banner
   * solo para los recién enlazados y solo si faltan. Devuelve los enlazados.
   */
  async saveMangaLinks(links: MangaLink[]): Promise<number> {
    if (links.length === 0) return 0
    const linked = (
      await db.execute(sql`
        INSERT INTO manga_external_ids (manga_id, anilist_id, created_at, updated_at)
        SELECT v.manga_id, v.anilist_id, now(), now()
        FROM (VALUES ${values(links)}) AS v(manga_id, anilist_id, country, banner)
        WHERE NOT EXISTS (
          SELECT 1 FROM manga_external_ids o
          WHERE o.anilist_id = v.anilist_id AND o.manga_id <> v.manga_id
        )
        ON CONFLICT (manga_id) DO UPDATE
          SET anilist_id = EXCLUDED.anilist_id, updated_at = now()
          WHERE manga_external_ids.anilist_id IS NULL
        RETURNING manga_id
      `)
    ).rows as { manga_id: number }[]
    const ids = new Set(linked.map((r) => Number(r.manga_id)))
    const done = links.filter((l) => ids.has(l.malId))

    const withCountry = done.filter((l) => l.country)
    if (withCountry.length > 0)
      await db.execute(sql`
        UPDATE manga m SET country_of_origin = v.country
        FROM (VALUES ${values(withCountry)}) AS v(manga_id, anilist_id, country, banner)
        WHERE m.mal_id = v.manga_id AND m.country_of_origin IS NULL
      `)

    const withBanner = done.filter((l) => l.banner)
    if (withBanner.length > 0)
      await db.execute(sql`
        INSERT INTO manga_media (manga_id, media_type, src, size, source, priority)
        SELECT v.manga_id, 'banner', v.banner, NULL, 'anilist', ${MEDIA_SOURCE_PRIORITY.anilist ?? 10}::int
        FROM (VALUES ${values(withBanner)}) AS v(manga_id, anilist_id, country, banner)
        WHERE NOT EXISTS (
          SELECT 1 FROM manga_media mm
          WHERE mm.manga_id = v.manga_id AND mm.media_type = 'banner'
        )
        ON CONFLICT (manga_id, media_type, src) DO NOTHING
      `)

    return done.length
  },
}
