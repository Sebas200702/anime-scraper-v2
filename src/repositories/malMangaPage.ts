import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { staff } from '../schemas/staff.js'
import { mangaStaff } from '../schemas/mangaRelations.js'
import { batchUpsert } from '../shared/batchUpsert.js'
import { chunk } from '../utils/chunk.js'
import { unique } from '../utils/deduplicate.js'
import type { MalMangaPageProcessorResult } from '../processors/malMangaPage.js'

/**
 * Guarda el equipo de las obras impresas (autores, ilustradores, editores).
 *
 * La persona se crea con el id de MAL (el de personas ✓) y su nombre; el
 * vínculo con la obra lleva el rol ("Story", "Art", "Editor"…).
 */
export const malMangaPageRepository = {
  async saveMalMangaPage(
    results: MalMangaPageProcessorResult[]
  ): Promise<number> {
    const links = unique(
      results.flatMap((r) => r.staff),
      (s) => `${s.mangaId}:${s.staffId}:${s.role}`
    )
    if (links.length === 0) return 0

    const people = unique(links, (s) => `${s.staffId}`).map((s) => ({
      malId: s.staffId,
      name: s.name,
    }))
    for (const batch of chunk(people, 1_000)) {
      await db.execute(sql`
        INSERT INTO staff (mal_id, name)
        SELECT v.id, v.name
        FROM (VALUES ${sql.join(
          batch.map((p) => sql`(${p.malId}::int, ${p.name}::text)`),
          sql`, `
        )}) AS v(id, name)
        ON CONFLICT (mal_id) DO UPDATE SET
          name = COALESCE(NULLIF(EXCLUDED.name, ''), staff.name)
      `)
    }

    await batchUpsert(
      mangaStaff,
      links.map((s) => ({
        mangaId: s.mangaId,
        staffId: s.staffId,
        role: s.role,
      })),
      3,
      'manga-staff'
    )

    return links.length
  },
}
