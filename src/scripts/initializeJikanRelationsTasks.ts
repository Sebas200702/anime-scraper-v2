import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'
import { anime } from '../schemas/anime.js'
import type { ScrapingTask } from '../types/index.js'

export const initializeJikanRelationsTasks = async () => {
  const BATCH_SIZE = 1000
  let offset = 0
  let total = 0
  let hasMore = true

  while (hasMore) {
    const animes = await db
      .select({
        malId: anime.malId,
      })
      .from(anime)
      .limit(BATCH_SIZE)
      .offset(offset)

    if (!animes || animes.length === 0) {
      break
    }
    const completedTasks = await taskRepository.getTasks('jikanRelations')
    console.log(
      `Found ${completedTasks.length} already completed/in-progress tasks`
    )
    const tasks = createTasks(animes, completedTasks)

    await taskRepository.createManyTasks(tasks)

    total += tasks.length
    console.log(`Initialized batch: ${tasks.length}  tasks.`)

    offset += BATCH_SIZE
    if (animes.length < BATCH_SIZE) hasMore = false
  }
  console.log(`Initialized total of ${total} relations tasks.`)
}

const createTasks = (
  animes: { malId: number }[],
  completedTasks: ScrapingTask[]
) => {
  const tasks = []
  for (const anime of animes) {
    const animeId = anime.malId

    const detailsId = `anime_details_${animeId}`
    if (!completedTasks.some((task) => task.entityId === detailsId)) {
      tasks.push({
        entityType: 'jikanRelations',
        entityId: detailsId,
        taskType: 'anime_details_hydration',
        priority: 5,
        status: 'pending',
        payload: { animeId: animeId },
      })
    }
    const charactersId = `anime_characters_${animeId}`
    if (!completedTasks.some((task) => task.entityId === charactersId)) {
      tasks.push({
        entityType: 'jikanRelations',
        entityId: charactersId,
        taskType: 'anime_characters_hydration',
        priority: 5,
        status: 'pending',
        payload: { animeId: animeId },
      })
    }
    const staffId = `anime_staff_${animeId}`
    if (!completedTasks.some((task) => task.entityId === staffId)) {
      tasks.push({
        entityType: 'jikanRelations',
        entityId: staffId,
        taskType: 'anime_staff_hydration',
        priority: 5,
        status: 'pending',
        payload: { animeId: animeId },
      })
    }
  }
  return tasks
}
