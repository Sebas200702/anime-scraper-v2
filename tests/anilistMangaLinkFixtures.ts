import { sql } from 'drizzle-orm'
import { db } from '../src/libs/db.js'

/** Fixtures del test de integración del enlace AniList de manga (S6, L14). */
export const B = 995_000_000
const IDS = [1, 2, 3, 4, 5, 6, 7].map((i) => B + i)
const inRange = sql`BETWEEN ${B + 1} AND ${B + 7}`

export const cleanup = async () => {
  await db.execute(
    sql`DELETE FROM ingest.task WHERE source = 'anilist' AND entity_id = 'anilist_manga_link'`
  )
  await db.execute(sql`DELETE FROM manga_media WHERE manga_id ${inRange}`)
  await db.execute(
    sql`DELETE FROM manga_external_ids WHERE manga_id ${inRange}`
  )
  await db.execute(sql`DELETE FROM manga WHERE mal_id ${inRange}`)
}

/**
 * B+2 ya tiene anilist_id 555; B+3 ya tiene país y banner (de MAL); B+6 tiene
 * fila externa con anilist_id NULL; el resto no tiene fila externa.
 */
export const seedFixtures = async () => {
  for (const id of IDS)
    await db.execute(
      sql`INSERT INTO manga (mal_id, title, country_of_origin)
          VALUES (${id}, ${`Link ${id}`}, ${id === B + 3 ? 'JP' : null})`
    )
  await db.execute(
    sql`INSERT INTO manga_external_ids (manga_id, anilist_id, created_at, updated_at)
        VALUES (${B + 2}, 555, now(), now()), (${B + 6}, NULL, now(), now())`
  )
  await db.execute(
    sql`INSERT INTO manga_media (manga_id, media_type, src, source, priority)
        VALUES (${B + 3}, 'banner', 'https://mal/banner.jpg', 'mal', 20)`
  )
}

/** Aparca las demás tareas de anilist fuera de las corridas; devuelve el restore. */
export const parkOtherAnilistTasks = async () => {
  const parked = (
    await db.execute(
      sql`SELECT id, status, refresh_after FROM ingest.task
          WHERE source = 'anilist' AND entity_id <> 'anilist_manga_link'`
    )
  ).rows as { id: number; status: string; refresh_after: unknown }[]
  await db.execute(
    sql`UPDATE ingest.task SET status = 'completed', refresh_after = now() + interval '1 day'
        WHERE source = 'anilist' AND entity_id <> 'anilist_manga_link'`
  )
  return async () => {
    for (const row of parked)
      await db.execute(
        sql`UPDATE ingest.task SET status = ${row.status}, refresh_after = ${row.refresh_after}
            WHERE id = ${row.id}`
      )
  }
}

export const linkTask = async () =>
  (
    await db.execute(
      sql`SELECT status, attempts, payload, last_error,
                 refresh_after > now() + interval '19 hours 50 minutes'
                   AND refresh_after < now() + interval '20 hours 10 minutes' AS daily
          FROM ingest.task
          WHERE source = 'anilist' AND entity_id = 'anilist_manga_link'`
    )
  ).rows[0] as {
    status: string
    attempts: number
    payload: Record<string, unknown>
    last_error: string | null
    daily: boolean | null
  }

export const snapshot = async () => {
  const rows = (
    await db.execute(
      sql`SELECT m.mal_id, x.anilist_id, m.country_of_origin
          FROM manga m LEFT JOIN manga_external_ids x ON x.manga_id = m.mal_id
          WHERE m.mal_id ${inRange} ORDER BY m.mal_id`
    )
  ).rows as {
    mal_id: number
    anilist_id: number | null
    country_of_origin: string | null
  }[]
  const banners = (
    await db.execute(
      sql`SELECT manga_id, source, priority, src FROM manga_media
          WHERE media_type = 'banner' AND manga_id ${inRange}
          ORDER BY manga_id, src`
    )
  ).rows as {
    manga_id: number
    source: string
    priority: number
    src: string
  }[]
  return {
    linked: Object.fromEntries(rows.map((r) => [r.mal_id, r.anilist_id])),
    country: Object.fromEntries(
      rows.map((r) => [r.mal_id, r.country_of_origin])
    ),
    banners: banners.map(
      (b) => `${b.manga_id}:${b.source}:${b.priority}:${b.src}`
    ),
  }
}
