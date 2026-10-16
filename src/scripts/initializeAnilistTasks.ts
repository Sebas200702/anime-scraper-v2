import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'
import { anime } from '../schemas/anime.js'

/**
 * Genera las tareas de banner (AniList) para todo el catálogo local.
 * AniList se consulta por `idMal`, así que basta con el `mal_id`.
 */
export const initializeAnilistTasks = async () => {
  const existing = await taskRepository.getExistingEntityIds('anilist')
  console.log(`Found ${existing.size} existing anilist tasks — skipping those`)

  const BATCH_SIZE = 2000
  let offset = 0
  let total = 0
  let hasMore = true

  while (hasMore) {
    const animes = await db
      .select({ malId: anime.malId })
      .from(anime)
      .limit(BATCH_SIZE)
        .orderBy(anime.malId)
      .offset(offset)

    if (!animes || animes.length === 0) break

    const tasks = animes
      .filter((entry) => !existing.has(`anime_banner_${entry.malId}`))
      .map((entry) => ({
        source: 'anilist',
        entityId: `anime_banner_${entry.malId}`,
        taskType: 'anime_banner_hydration',
        priority: 10,
        status: 'pending',
        payload: { animeId: entry.malId },
      }))

    if (tasks.length > 0) {
      await taskRepository.createManyTasks(tasks)
      total += tasks.length
      console.log(`Batch: ${tasks.length} new tasks (total: ${total})`)
    }

    offset += BATCH_SIZE
    if (animes.length < BATCH_SIZE) hasMore = false
  }

  console.log(
    `✓ Created ${total} new anilist banner tasks (${existing.size} already existed)`
  )
}
