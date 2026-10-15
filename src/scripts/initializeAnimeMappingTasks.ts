import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'
import { anime } from '../schemas/anime.js'

export const initializeAnimeMappingTasks = async () => {
  try {
    console.log('Fetching anime data from database in batches...')

    const existing = await taskRepository.getExistingEntityIds('animeMapping')
    console.log(
      `Found ${existing.size} existing animeMapping tasks — skipping those`
    )

    const fetchBatchSize = 2000
    let offset = 0
    let totalCreated = 0
    let hasMore = true

    while (hasMore) {
      const animes = await db
        .select({
          malId: anime.malId,
          title: anime.title,
          titleJapanese: anime.titleJapanese,
          titleEnglish: anime.titleEnglish,
          year: anime.year,
          type: anime.type,
        })
        .from(anime)
        .limit(fetchBatchSize)
        .offset(offset)

      if (!animes || animes.length === 0) break

      const tasks = animes
        .filter((a) => !existing.has(`anime_mapping_${a.malId}`))
        .map((a) => ({
          source: 'animeMapping',
          entityId: `anime_mapping_${a.malId}`,
          taskType: 'anime_mapping_hydration',
          priority: 5,
          status: 'pending',
          payload: {
            title: a.title,
            title_japanese: a.titleJapanese,
            title_english: a.titleEnglish,
            year: a.year,
            type: a.type,
          },
        }))

      if (tasks.length > 0) {
        await taskRepository.createManyTasks(tasks)
        totalCreated += tasks.length
        console.log(`Batch: ${tasks.length} new tasks (total: ${totalCreated})`)
      }

      if (animes.length < fetchBatchSize) {
        hasMore = false
      } else {
        offset += fetchBatchSize
      }
    }

    console.log(
      `✓ Created ${totalCreated} new animeMapping tasks (${existing.size} already existed)`
    )
  } catch (error) {
    console.error('Error initializing animeMapping tasks:', error)
  }
}
