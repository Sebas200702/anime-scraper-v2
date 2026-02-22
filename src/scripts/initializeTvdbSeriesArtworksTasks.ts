import { db } from '../libs/db.js'
import { animeExternalIds } from '../schemas/animeExternal.js'
import { anime } from '../schemas/anime.js'
import { eq, isNotNull } from 'drizzle-orm'
import { taskRepository } from '../repositories/tasks.js'

export async function initializeTvdbSeriesArtworksTasks() {
  const existing =
    await taskRepository.getExistingEntityIds('tvdbSeriesArtworks')
  console.log(
    `Found ${existing.size} existing tvdbSeriesArtworks tasks — skipping those`
  )

  const BATCH_SIZE = 1000
  let offset = 0
  let total = 0

  while (true) {
    const entries = await db
      .select({
        animeId: animeExternalIds.animeId,
        tvdbId: animeExternalIds.tvdbId,
        anime: { type: anime.type },
      })
      .from(animeExternalIds)
      .innerJoin(anime, eq(animeExternalIds.animeId, anime.malId))
      .where(isNotNull(animeExternalIds.tvdbId))
      .limit(BATCH_SIZE)
      .offset(offset)

    if (!entries.length) break

    const tasks = entries
      .filter((entry) => !existing.has(`tvdb_artworks_${entry.tvdbId}`))
      .map((entry) => ({
        entityType: 'tvdbSeriesArtworks',
        entityId: `tvdb_artworks_${entry.tvdbId}`,
        taskType: 'tvdb_series_artworks',
        priority: 5,
        status: 'pending',
        payload: {
          tvdb_id: entry.tvdbId,
          anime_id: entry.animeId,
          type: entry.anime?.type,
        },
      }))

    if (tasks.length > 0) {
      await taskRepository.createManyTasks(tasks)
      total += tasks.length
      console.log(
        `Batch: ${tasks.length} new tvdb artworks tasks (total: ${total})`
      )
    }

    offset += BATCH_SIZE
    if (entries.length < BATCH_SIZE) break
  }

  console.log(
    `✓ Created ${total} new tvdb artworks tasks (${existing.size} already existed)`
  )
}
