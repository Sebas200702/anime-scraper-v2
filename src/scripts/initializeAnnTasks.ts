import { taskRepository } from '../repositories/tasks.js'
import { db } from '../libs/db.js'
import { animeExternalIds } from '../schemas/animeExternal.js'
import { anime } from '../schemas/anime.js'
import { eq, isNotNull } from 'drizzle-orm'

/**
 * Siembra una tarea de la enciclopedia de ANN por anime con id de ANN.
 *
 * El id viene del dump offline (curado), así que el emparejamiento es exacto:
 * no hay búsquedas por título y no puede colarse la ficha de otro anime.
 */
export const initializeAnnTasks = async () => {
  const existing = await taskRepository.getExistingEntityIds('ann')
  console.log(`Found ${existing.size} existing ann tasks — skipping those`)

  const entries = await db
    .select({ animeId: animeExternalIds.animeId, annId: animeExternalIds.annId })
    .from(animeExternalIds)
    .innerJoin(anime, eq(animeExternalIds.animeId, anime.malId))
    .where(isNotNull(animeExternalIds.annId))
    .orderBy(animeExternalIds.animeId)

  const tasks = entries
    .filter((e) => e.annId !== null && !existing.has(`ann_${e.annId}`))
    .map((e) => ({
      source: 'ann',
      entityId: `ann_${e.annId}`,
      taskType: 'ann_themes_hydration',
      priority: 15,
      status: 'pending' as const,
      payload: { annId: e.annId, animeId: e.animeId },
    }))

  if (tasks.length > 0) {
    for (let i = 0; i < tasks.length; i += 5000) {
      await taskRepository.createManyTasks(tasks.slice(i, i + 5000))
    }
  }
  console.log(`✓ Created ${tasks.length} ann tasks`)
}
