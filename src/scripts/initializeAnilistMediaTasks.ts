import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'

/**
 * Siembra una tarea por **medio con id de AniList** para el pase profundo:
 * reparto completo con voces, créditos de staff, relaciones y enlaces.
 *
 * Se hace para el anime (30k) y para las obras impresas (70k): AniList es la
 * única fuente con el reparto entero y con el rol fino.
 */
export const initializeAnilistMediaTasks = async () => {
  const existing = await taskRepository.getExistingEntityIds('anilistMedia')
  console.log(
    `Found ${existing.size} existing anilistMedia tasks — skipping those`
  )

  const rows = (
    await db.execute(sql`
      SELECT a.mal_id AS id, x.anilist_id AS anilist_id, 'ANIME' AS media_type
      FROM anime a
      JOIN anime_external_ids x ON x.anime_id = a.mal_id
      WHERE x.anilist_id IS NOT NULL
      UNION ALL
      SELECT m.mal_id AS id, x.anilist_id AS anilist_id, 'MANGA' AS media_type
      FROM manga m
      JOIN manga_external_ids x ON x.manga_id = m.mal_id
      WHERE x.anilist_id IS NOT NULL
      ORDER BY id
    `)
  ).rows as unknown as {
    id: number
    anilist_id: number
    media_type: 'ANIME' | 'MANGA'
  }[]

  const tasks = rows
    .filter((row) => !existing.has(`media_${row.media_type}_${row.id}`))
    .map((row) => ({
      source: 'anilistMedia',
      entityId: `media_${row.media_type}_${row.id}`,
      taskType: 'media_anilist_details_hydration',
      priority: 10,
      status: 'pending' as const,
      payload: {
        anilistId: row.anilist_id,
        mediaId: row.id,
        mediaType: row.media_type,
      },
    }))

  if (tasks.length > 0) await taskRepository.createManyTasks(tasks)
  console.log(`✓ Created ${tasks.length} anilist media tasks`)
}
