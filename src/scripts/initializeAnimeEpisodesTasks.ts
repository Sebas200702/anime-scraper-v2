import { taskRepository } from '../repositories/tasks.js'
import { db } from '../libs/db.js'
import { animeExternalIds } from '../schemas/animeExternal.js'

export async function initializeAnimeEpisodesTasks() {
  const existing = await taskRepository.getExistingEntityIds('animeEpisodes')
  console.log(
    `Found ${existing.size} existing animeEpisodes tasks — skipping those`
  )

  const BATCH_SIZE = 5000
  let offset = 0
  let totalInitialized = 0
  let hasMore = true

  console.log('Starting initialization of anime episodes tasks...')

  while (hasMore) {
    const animes = await db
      .select()
      .from(animeExternalIds)
      .limit(BATCH_SIZE)
      .orderBy(animeExternalIds.animeId)
      .offset(offset)

    if (!animes || animes.length === 0) break

    const tasks = animes
      .filter((anime) => !existing.has(`anime_episodes_${anime.animeId}`))
      .map((anime) => ({
        source: 'animeEpisodes',
        entityId: `anime_episodes_${anime.animeId}`,
        taskType: 'anime_episodes_hydration',
        priority: 5,
        status: 'pending',
        payload: {
          kitsu_id: anime.kitsuId,
          anime_id: anime.animeId,
        },
      }))

    if (tasks.length > 0) {
      await taskRepository.createManyTasks(tasks)
      totalInitialized += tasks.length
      console.log(
        `Batch ${offset / BATCH_SIZE + 1}: ${tasks.length} new tasks (total: ${totalInitialized})`
      )
    }

    offset += BATCH_SIZE
    if (animes.length < BATCH_SIZE) hasMore = false
  }

  console.log(
    `✓ Created ${totalInitialized} new animeEpisodes tasks (${existing.size} already existed)`
  )
}
