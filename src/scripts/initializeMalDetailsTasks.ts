import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'
import { anime } from '../schemas/anime.js'
import { MAL_RANKING_TYPES } from '../services/mal.js'

/**
 * Siembra una tarea de detalle MAL (API oficial) por anime del catálogo.
 * Idempotente y con `ORDER BY` (paginación determinista).
 */
export const initializeMalDetailsTasks = async () => {
  // Bulk primero: 1 tarea por tipo de ranking (500 anime por request). Cubre la
  // mayor parte del catálogo en ~60 requests en vez de 30.000.
  const existingRankings = await taskRepository.getExistingEntityIds('mal')
  const rankingTasks = MAL_RANKING_TYPES.map((rankingType) => ({
    source: 'mal',
    entityId: `mal_ranking_${rankingType}`,
    taskType: 'anime_mal_ranking_hydration',
    priority: 20,
    status: 'pending' as const,
    payload: { rankingType },
  })).filter((t) => !existingRankings.has(t.entityId))
  if (rankingTasks.length > 0) {
    await taskRepository.createManyTasks(rankingTasks)
  }
  console.log(`✓ Created ${rankingTasks.length} mal ranking tasks`)

  // Detalle por-anime: queda para el refresh/lo que el ranking no cubra.
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
