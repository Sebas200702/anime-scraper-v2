import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'
import { anime } from '../schemas/anime.js'

/**
 * Siembra una tarea por anime para sacar personajes/seiyuus/staff de la ficha
 * HTML de MAL (lo único que ni la API de MAL ni AniList/Kitsu dan con ids MAL).
 * Idempotente y con `ORDER BY` para paginación determinista.
 */
export const initializeMalHtmlTasks = async () => {
  const existing = await taskRepository.getExistingEntityIds('malHtml')
  console.log(`Found ${existing.size} existing malHtml tasks — skipping those`)

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
      .filter((a) => !existing.has(`anime_malhtml_${a.malId}`))
      .map((a) => ({
        source: 'malHtml',
        entityId: `anime_malhtml_${a.malId}`,
        taskType: 'anime_mal_html_hydration',
        priority: 5,
        status: 'pending',
        payload: { animeId: a.malId },
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
    `✓ Created ${total} new malHtml tasks (${existing.size} already existed)`
  )
}
