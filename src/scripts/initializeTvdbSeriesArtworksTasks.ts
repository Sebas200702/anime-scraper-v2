import { db } from '../libs/db.js'
import { animeExternalIds } from '../schemas/animeExternal.js'
import { anime } from '../schemas/anime.js'
import { eq } from 'drizzle-orm'
import { taskRepository } from '../repositories/tasks.js'
export async function initializeTvdbSeriesArtworksTasks() {
  const completedTasks = await taskRepository.getCompletedTasks(
    null,
    'tvdbSeriesArtworks'
  )
  console.log(
    `Found ${completedTasks.length} already completed/in-progress tvdbSeriesArtworks tasks`
  )
  const BATCH_SIZE = 1000
  let offset = 0
  let total = 0
  let hasMore = true

  while (hasMore) {
    const entries = await db
      .select({
        animeId: animeExternalIds.animeId,
        tvdbId: animeExternalIds.tvdbId,
        anime: {
          type: anime.type,
        },
      })
      .from(animeExternalIds)
      .limit(BATCH_SIZE)
      .offset(offset)
      .innerJoin(anime, eq(animeExternalIds.animeId, anime.malId))

    if (!entries || entries.length === 0) {
      break
    }

    const filtered = entries.filter((entry) => entry.tvdbId != null)
    if (!filtered.length) {
      offset += BATCH_SIZE
      if (entries.length < BATCH_SIZE) hasMore = false
      continue
    }

    const tasks = []
    for (const entry of filtered) {
      const entityId = `tvdb_artworks_${entry.tvdbId}`
      if (!completedTasks.some((task) => task.entityId === entityId)) {
        tasks.push({
          entityType: 'tvdbSeriesArtworks',
          entityId: entityId,
          taskType: 'tvdb_series_artworks',
          priority: 5,
          status: 'pending',
          payload: {
            tvdbId: entry.tvdbId,
            animeId: entry.animeId,
            type: entry.anime?.type,
          },
        })
      }
    }

    await taskRepository.createManyTasks(tasks)

    total += tasks.length
    console.log(`Initialized batch: ${tasks.length} tvdb artworks tasks.`)

    offset += BATCH_SIZE
    if (entries.length < BATCH_SIZE) hasMore = false
  }
  console.log(`Initialized total of ${total} tvdb artworks tasks.`)
}
