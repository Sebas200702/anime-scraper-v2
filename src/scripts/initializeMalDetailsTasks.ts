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

  // El detalle por-anime NO se siembra en backfill: el ranking ya trae
  // los mismos campos (500 por request). El taskType queda declarado para el
  // refresh quirúrgico del Modo B.
}
