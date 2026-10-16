import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'
import { anime } from '../schemas/anime.js'

/**
 * Genera las tareas de banner (AniList) para todo el catálogo local.
 * AniList se consulta por `idMal`, así que basta con el `mal_id`.
 */
export const initializeAnilistTasks = async () => {
  const existing = await taskRepository.getExistingEntityIds('anilist')
  console.log(`Found ${existing.size} existing anilist tasks — skipping those`)

  const BATCH_SIZE = 2000
  let offset = 0
  let total = 0
  let hasMore = true

  while (hasMore) {
    const animes = await db
      .select({ malId: anime.malId })
      .from(anime)
      .limit(BATCH_SIZE)
      .orderBy(anime.malId)
      .offset(offset)

    if (!animes || animes.length === 0) break

    const tasks = animes
      .filter((entry) => !existing.has(`anime_banner_${entry.malId}`))
      .map((entry) => ({
        source: 'anilist',
        entityId: `anime_banner_${entry.malId}`,
        taskType: 'anime_banner_hydration',
        priority: 10,
        status: 'pending',
        payload: { animeId: entry.malId },
      }))

    if (tasks.length > 0) {
      await taskRepository.createManyTasks(tasks)
      total += tasks.length
      console.log(`Batch: ${tasks.length} new tasks (total: ${total})`)
    }

    offset += BATCH_SIZE
    if (animes.length < BATCH_SIZE) hasMore = false
  }

  console.log(
    `✓ Created ${total} new anilist banner tasks (${existing.size} already existed)`
  )

  // Backfill en bulk: una tarea por año (la fuente pagina internamente, 50 por
  // request) → ~87 tareas y ~500 requests en vez de 30.561/30.000.
  const existingYears = await taskRepository.getExistingEntityIds('anilist')
  const thisYear = new Date().getUTCFullYear()
  const yearTasks = []
  for (let year = 1940; year <= thisYear; year++) {
    const entityId = `anilist_year_${year}`
    if (existingYears.has(entityId)) continue
    yearTasks.push({
      source: 'anilist',
      entityId,
      taskType: 'anilist_year_hydration',
      priority: 20,
      status: 'pending',
      payload: { year },
    })
  }
  if (yearTasks.length > 0) await taskRepository.createManyTasks(yearTasks)
  console.log(`✓ Created ${yearTasks.length} anilist catalog year tasks`)
}
