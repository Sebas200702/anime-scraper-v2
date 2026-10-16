import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'
import { anime } from '../schemas/anime.js'

/**
 * Siembra una tarea de detalle MAL (API oficial) por anime del catálogo.
 * Idempotente y con `ORDER BY` (paginación determinista).
 */
export const initializeMalDetailsTasks = async () => {
  const existing = await taskRepository.getExistingEntityIds('mal')
  console.log(`Found ${existing.size} existing mal tasks — skipping those`)

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
      .filter((a) => !existing.has(`anime_mal_${a.malId}`))
      .map((a) => ({
        source: 'mal',
        entityId: `anime_mal_${a.malId}`,
        taskType: 'anime_mal_details_hydration',
        priority: 10,
        status: 'pending',
        payload: { animeId: a.malId },
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
    `✓ Created ${total} new mal detail tasks (${existing.size} already existed)`
  )
}
