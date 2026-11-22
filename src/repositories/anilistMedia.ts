import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import {
  animeStaff,
  animeRelatedAnime,
} from '../schemas/animeRelations.js'
import { mangaStaff, mangaRelation } from '../schemas/mangaRelations.js'
import { anime } from '../schemas/anime.js'
import { manga } from '../schemas/manga.js'
import { batchUpsert } from '../shared/batchUpsert.js'
import { chunk } from '../utils/chunk.js'
import { unique } from '../utils/deduplicate.js'
import { filterByExistingFk } from '../shared/fkFilter.js'
import { normalizeText } from '../utils/normalize.js'
import type { AniListMediaProcessorResult } from '../processors/anilistMedia.js'
import { saveCast } from './anilistMedia/cast.js'
import { loadStaffIndex } from './anilistMedia/staffIndex.js'

export { invalidateStaffIndex } from './anilistMedia/staffIndex.js'

type Result = AniListMediaProcessorResult & { mediaId: number }

/**
 * Pase profundo de AniList. Solo escribe los resultados con `mediaId` (el id
 * de la tarea; null = idMal no coincide y se saltó). Staff y voces se cruzan
 * por nombre global de `staff`; los personajes, solo dentro del reparto del
 * mismo medio (`anilistMedia/cast.ts`).
 */
export const anilistMediaRepository = {
  async saveAnilistMedia(
    results: AniListMediaProcessorResult[]
  ): Promise<number> {
    const staffIndex = await loadStaffIndex()
    const withId = results.filter((r): r is Result => Boolean(r.mediaId))
    const animeResults = withId.filter((r) => r.mediaType === 'ANIME')
    const mangaResults = withId.filter((r) => r.mediaType === 'MANGA')

    // 1) Staff: se cruza con el `staff` de MAL por nombre.
    for (const [rows, junction, mediaColumn] of [
      [animeResults, animeStaff, 'animeId'],
      [mangaResults, mangaStaff, 'mangaId'],
    ] as const) {
      const links = unique(
        rows.flatMap((r) =>
          r.staff
            .map((s) => ({
              mediaId: r.mediaId,
              staffId: staffIndex.get(normalizeText(s.name)),
              role: s.role,
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

    // 2) Reparto (anime y manga), con sus voces, ids externos y retratos.
    await saveCast('ANIME', animeResults, staffIndex)
    await saveCast('MANGA', mangaResults, staffIndex)

    // 3) Relaciones (con el id de MAL del medio relacionado).
    const animeRelations = unique(
      animeResults.flatMap((r) =>
        r.relations.map((rel) => ({
          animeId: r.mediaId,
          relatedAnimeId: rel.relatedMalId,
          relationType: rel.relationType,
        }))
      ),
      (r) => `${r.animeId}:${r.relatedAnimeId}:${r.relationType}`
    )
    await batchUpsert(
      animeRelatedAnime,
      await filterByExistingFk(
        animeRelations,
        (r) => r.relatedAnimeId,
        anime,
        anime.malId,
        false
      ),
      3,
      'anime-relation'
    )

    const mangaRelations = unique(
      mangaResults.flatMap((r) =>
        r.relations.map((rel) => ({
          mangaId: r.mediaId,
          relatedMangaId: rel.relatedMalId,
          relationType: rel.relationType,
        }))
      ),
      (r) => `${r.mangaId}:${r.relatedMangaId}:${r.relationType}`
    )
    await batchUpsert(
      mangaRelation,
      await filterByExistingFk(
        mangaRelations,
        (r) => r.relatedMangaId,
        manga,
        manga.malId,
        false
      ),
      3,
      'manga-relation'
    )

    // 4) Enlaces externos.
    for (const [rows, table, column] of [
      [animeResults, 'anime_external_link', 'anime_id'],
      [mangaResults, 'manga_external_link', 'manga_id'],
    ] as const) {
      const links = unique(
        rows.flatMap((r) =>
          r.externalLinks.map((l) => ({ mediaId: r.mediaId, ...l }))
        ),
        (l) => `${l.mediaId}:${l.url}`
      )
      for (const batch of chunk(links, 500)) {
        await db.execute(sql`
          INSERT INTO ${sql.raw(table)} (${sql.raw(column)}, site, url, type)
          SELECT v.media_id, v.site, v.url, v.type
          FROM (VALUES ${sql.join(
            batch.map(
              (l) =>
                sql`(${l.mediaId}::int, ${l.site}::text, ${l.url}::text, ${l.type}::text)`
            ),
            sql`, `
          )}) AS v(media_id, site, url, type)
          ON CONFLICT (${sql.raw(column)}, url) DO UPDATE SET
            site = EXCLUDED.site, type = EXCLUDED.type
        `)
      }
    }

    return results.length
  },
}
