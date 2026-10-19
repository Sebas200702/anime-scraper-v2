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

  // El detalle por-anime **no** está en el ranking: `broadcast` y
  // `duration` solo vienen aquí, y `studios`/géneros llegan incompletos. Con
  // la cuota de MAL por IP (ver `KEY_SCOPED_HOSTS`) son ~25 min para las
  // 30.561 fichas, así que se siembra completo.
  // `SCRAPER_MAL_DETAILS=0` lo desactiva (el ranking basta para un refresh).
  if (process.env.SCRAPER_MAL_DETAILS === '0') {
    console.log('· detalle por-anime desactivado (SCRAPER_MAL_DETAILS=0)')
    return
  }

  const existingDetails = await taskRepository.getExistingEntityIds('mal')
  const animeRows = await db
    .select({ malId: anime.malId })
    .from(anime)
    .orderBy(anime.malId)
  const detailTasks = animeRows
    .filter((a) => !existingDetails.has(`mal_details_${a.malId}`))
    .map((a) => ({
      source: 'mal',
      entityId: `mal_details_${a.malId}`,
      taskType: 'anime_mal_details_hydration',
      priority: 15,
      status: 'pending' as const,
      payload: { animeId: a.malId },
    }))
  if (detailTasks.length > 0) {
    for (let i = 0; i < detailTasks.length; i += 5000) {
      await taskRepository.createManyTasks(detailTasks.slice(i, i + 5000))
    }
  }
  console.log(`✓ Created ${detailTasks.length} mal detail tasks`)
}
