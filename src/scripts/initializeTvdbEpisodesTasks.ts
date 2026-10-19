import { taskRepository } from '../repositories/tasks.js'
import { db } from '../libs/db.js'
import { animeExternalIds } from '../schemas/animeExternal.js'
import { anime } from '../schemas/anime.js'
import { eq, isNotNull } from 'drizzle-orm'

/**
 * Siembra una tarea por anime con id de TVDB para traer la **imagen de cada
 * episodio** (Kitsu solo la tiene de una parte).
 *
 * El mapeo a nuestra numeración lo hace el repositorio (recuento + fecha +
 * título); si no encaja, no se guarda imagen.
 */
export const initializeTvdbEpisodesTasks = async () => {
  const existing = await taskRepository.getExistingEntityIds('tvdbEpisodes')
  console.log(
    `Found ${existing.size} existing tvdbEpisodes tasks — skipping those`
  )

  const entries = await db
    .select({
      animeId: animeExternalIds.animeId,
      tvdbId: animeExternalIds.tvdbId,
    })
    .from(animeExternalIds)
    .innerJoin(anime, eq(animeExternalIds.animeId, anime.malId))
    .where(isNotNull(animeExternalIds.tvdbId))
    .orderBy(animeExternalIds.animeId)

  const tasks = entries
    .filter((e) => e.tvdbId !== null && !existing.has(`tvdb_eps_${e.tvdbId}`))
    .map((e) => ({
      source: 'tvdbEpisodes',
      entityId: `tvdb_eps_${e.tvdbId}`,
      taskType: 'tvdb_episodes_hydration',
      priority: 15,
      status: 'pending' as const,
      payload: { animeId: e.animeId, tvdbId: e.tvdbId },
    }))

  if (tasks.length > 0) {
    for (let i = 0; i < tasks.length; i += 5000) {
      await taskRepository.createManyTasks(tasks.slice(i, i + 5000))
    }
  }
  console.log(`✓ Created ${tasks.length} tvdb episode tasks`)
}
