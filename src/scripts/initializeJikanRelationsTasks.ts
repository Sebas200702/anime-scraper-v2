import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'
import { anime } from '../schemas/anime.js'

export const initializeJikanRelationsTasks = async () => {
  const existing = await taskRepository.getExistingEntityIds('jikanRelations')
  console.log(
    `Found ${existing.size} existing jikanRelations tasks — skipping those`
  )

  const BATCH_SIZE = 1000
  let offset = 0
  let total = 0
  let hasMore = true

  while (hasMore) {
    const animes = await db
      .select({ malId: anime.malId })
      .from(anime)
      .limit(BATCH_SIZE)
      .offset(offset)

    if (!animes || animes.length === 0) break

    const tasks = animes.flatMap((a) => {
      const entries = []
      if (!existing.has(`anime_details_${a.malId}`))
        entries.push({
          entityType: 'jikanRelations',
          entityId: `anime_details_${a.malId}`,
          taskType: 'anime_details_hydration',
          priority: 5,
          status: 'pending',
          payload: { animeId: a.malId },
        })
      if (!existing.has(`anime_characters_${a.malId}`))
        entries.push({
          entityType: 'jikanRelations',
          entityId: `anime_characters_${a.malId}`,
          taskType: 'anime_characters_hydration',
          priority: 5,
          status: 'pending',
          payload: { animeId: a.malId },
        })
      if (!existing.has(`anime_staff_${a.malId}`))
        entries.push({
          entityType: 'jikanRelations',
          entityId: `anime_staff_${a.malId}`,
          taskType: 'anime_staff_hydration',
          priority: 5,
          status: 'pending',
          payload: { animeId: a.malId },
        })
      return entries
    })

    if (tasks.length > 0) {
      await taskRepository.createManyTasks(tasks)
      total += tasks.length
      console.log(`Batch: ${tasks.length} new tasks (total: ${total})`)
    }

    offset += BATCH_SIZE
    if (animes.length < BATCH_SIZE) hasMore = false
  }

  console.log(
    `✓ Created ${total} new jikanRelations tasks (${existing.size} already existed)`
  )
}
