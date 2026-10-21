import { taskRepository } from '../repositories/tasks.js'
import { db } from '../libs/db.js'
import { animeExternalIds } from '../schemas/animeExternal.js'
import { anime } from '../schemas/anime.js'
import { eq, isNotNull } from 'drizzle-orm'
import { hasTmdbKey } from '../services/tmdb.js'

/**
 * Siembra una tarea por anime con id de TMDB para traer su **banner**
 * (backdrop) y las **miniaturas de episodio** (stills, con su
 * `episode_number`, que es la numeración estándar y por tanto la de MAL).
 *
 * Sin `TMDB_API_KEY` no se siembra nada: la fuente queda documentada pero
 * inactiva.
 */
export const initializeTmdbTasks = async () => {
  if (!hasTmdbKey()) {
    console.log(
      '· sin TMDB_API_KEY: la fuente tmdb queda inactiva (pon la key en .env y reejecuta)'
    )
    return
  }

  const existing = await taskRepository.getExistingEntityIds('tmdb')
  console.log(`Found ${existing.size} existing tmdb tasks — skipping those`)

  const entries = await db
    .select({
      animeId: animeExternalIds.animeId,
      tmdbId: animeExternalIds.tmdbId,
    })
    .from(animeExternalIds)
    .innerJoin(anime, eq(animeExternalIds.animeId, anime.malId))
    .where(isNotNull(animeExternalIds.tmdbId))
    .orderBy(animeExternalIds.animeId)

  const tasks = entries
    .filter((e) => e.tmdbId !== null && !existing.has(`tmdb_${e.tmdbId}`))
    .map((e) => ({
      source: 'tmdb',
      entityId: `tmdb_${e.tmdbId}`,
      taskType: 'tmdb_images_hydration',
      priority: 15,
      status: 'pending' as const,
      payload: { animeId: e.animeId, tmdbId: e.tmdbId },
    }))

  if (tasks.length > 0) {
    for (let i = 0; i < tasks.length; i += 5000) {
      await taskRepository.createManyTasks(tasks.slice(i, i + 5000))
    }
  }
  console.log(`✓ Created ${tasks.length} tmdb tasks`)
}
