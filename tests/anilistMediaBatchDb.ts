import { sql } from 'drizzle-orm'
import { db } from '../src/libs/db.js'
import { taskRepository } from '../src/repositories/tasks.js'
import { MAL_OFFSET } from './anilistMediaBatchFixtures.js'

/** Datos de la integración de T11 (S6, L19): anime 980001–980012. */
export const M = (i: number) => 980_000 + i
export const ALL = Array.from({ length: 12 }, (_, i) => M(i + 1))
const list = (ids: number[]) =>
  sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `
  )
const entities = (ids: number[]) =>
  sql.join(
    ids.map((id) => sql`${`media_ANIME_${id}`}`),
    sql`, `
  )
/** Personajes del simulador: 1e9 + (anilistId × 100 + i). */
const CHARS = sql`BETWEEN ${1e9 + (M(1) + MAL_OFFSET) * 100} AND ${1e9 + (M(12) + MAL_OFFSET) * 100 + 99}`

export const cleanup = async () => {
  await db.execute(
    sql`DELETE FROM ingest.task WHERE source = 'anilistMedia' AND entity_id IN (${entities(ALL)})`
  )
  for (const table of [
    'anime_character',
    'character_external',
    'character_media',
  ])
    await db.execute(
      sql`DELETE FROM ${sql.raw(table)} WHERE character_id ${CHARS}`
    )
  await db.execute(sql`DELETE FROM character WHERE mal_id ${CHARS}`)
  for (const table of ['anime_external_link', 'anime_external_ids'])
    await db.execute(
      sql`DELETE FROM ${sql.raw(table)} WHERE anime_id IN (${list(ALL)})`
    )
  await db.execute(sql`DELETE FROM anime WHERE mal_id IN (${list(ALL)})`)
}

/** Anime + id de AniList; tareas como `initializeAnilistMediaTasks`. */
export const seed = async (withTasks: number[]) => {
  for (const id of ALL) {
    await db.execute(
      sql`INSERT INTO anime (mal_id, title) VALUES (${id}, ${`Batch ${id}`})`
    )
    await db.execute(
      sql`INSERT INTO anime_external_ids (anime_id, anilist_id, created_at, updated_at)
          VALUES (${id}, ${id + MAL_OFFSET}, now(), now())`
    )
  }
  await taskRepository.createManyTasks(
    withTasks.map((id) => ({
      source: 'anilistMedia',
      entityId: `media_ANIME_${id}`,
      taskType: 'media_anilist_details_hydration',
      // Las dos últimas quedan fuera de un presupuesto de 10 (orden estable).
      priority: id > M(10) ? 5 : 10,
      status: 'pending' as const,
      payload: { anilistId: id + MAL_OFFSET, mediaId: id, mediaType: 'ANIME' },
    }))
  )
}

/** Aparca las demás tareas de `anilistMedia`; devuelve el restore. */
export const parkOthers = async () => {
  const rows = (
    await db.execute(
      sql`UPDATE ingest.task t SET status = 'completed', refresh_after = now() + interval '1 day'
          FROM ingest.task o WHERE t.id = o.id AND t.source = 'anilistMedia'
            AND t.status = 'pending' AND t.entity_id NOT IN (${entities(ALL)})
          RETURNING t.id, o.refresh_after`
    )
  ).rows as { id: number; refresh_after: unknown }[]
  return async () => {
    for (const row of rows)
      await db.execute(
        sql`UPDATE ingest.task SET status = 'pending', refresh_after = ${row.refresh_after} WHERE id = ${row.id}`
      )
  }
}

export const tasks = async () =>
  (
    await db.execute(
      sql`SELECT entity_id, status, attempts, skip_reason, last_error FROM ingest.task
          WHERE source = 'anilistMedia' AND entity_id IN (${entities(ALL)}) ORDER BY entity_id`
    )
  ).rows as {
    entity_id: string
    status: string
    attempts: number
    skip_reason: string | null
    last_error: string | null
  }[]

export const reschedule = () =>
  db.execute(
    sql`UPDATE ingest.task SET scheduled_at = now() WHERE source = 'anilistMedia' AND entity_id IN (${entities(ALL)})`
  )

/** Filas que el pase profundo deja para un anime. */
export const castRows = async (animeId: number) => ({
  cast: (
    await db.execute(
      sql`SELECT ac.character_id, ac.role, c.name, x.mal_id, x.anilist_id
          FROM anime_character ac JOIN character c ON c.mal_id = ac.character_id
          LEFT JOIN character_external x ON x.character_id = ac.character_id
          WHERE ac.anime_id = ${animeId} ORDER BY ac.character_id`
    )
  ).rows,
  links: (
    await db.execute(
      sql`SELECT site, url, type FROM anime_external_link WHERE anime_id = ${animeId} ORDER BY url`
    )
  ).rows,
})
