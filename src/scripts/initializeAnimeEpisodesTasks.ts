import { taskRepository } from '../repositories/tasks.js'
import { db } from '../libs/db.js'
import { animeExternalIds } from '../schemas/animeExternal.js'

export async function initializeAnimeEpisodesTasks() {
  const BATCH_SIZE = 5000
  let offset = 0
  let totalInitialized = 0
  let hasMore = true

  console.log('Starting initialization of anime episodes tasks...')

  while (hasMore) {
    // Fetch a batch of animes from the database
    const animes = await db
      .select()
      .from(animeExternalIds)
      .limit(BATCH_SIZE)
      .offset(offset)

    if (!animes || animes.length === 0) {
      break
    }

    // Create tasks for this batch
    const tasks = animes.map((anime) => ({
      entityType: 'animeEpisodes',
      entityId: `anime_episodes_${anime.animeId}`,
      taskType: 'anime_episodes_hydration',
      priority: 5,
      status: 'pending',
      payload: {
        kitsuId: anime.kitsuId,
        animeId: anime.animeId,
      },
    }))

    // Insert tasks
    await taskRepository.createManyTasks(tasks)

    totalInitialized += tasks.length
    console.log(
      `Processed batch ${
        offset / BATCH_SIZE + 1
      }: Fetched and initialized ${tasks.length} tasks.`
    )

    offset += BATCH_SIZE

    // If we received fewer items than the batch size, we are done
    if (animes.length < BATCH_SIZE) {
      hasMore = false
    }
  }

  console.log(
    `Initialized total of ${totalInitialized} anime episodes hydration tasks.`
  )
}
