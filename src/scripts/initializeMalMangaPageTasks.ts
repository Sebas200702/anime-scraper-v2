import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'

/**
 * Siembra una tarea por obra impresa para traer su equipo (autores,
 * ilustradores, editores) con el id de persona de MAL.
 */
export const initializeMalMangaPageTasks = async () => {
  const existing = await taskRepository.getExistingEntityIds('malMangaPage')
  console.log(
    `Found ${existing.size} existing malMangaPage tasks — skipping those`
  )

  const rows = (
    await db.execute(sql`SELECT mal_id FROM manga ORDER BY mal_id`)
  ).rows as unknown as { mal_id: number }[]

  const tasks = rows
    .map((row) => row.mal_id)
    .filter((id) => !existing.has(`manga_page_${id}`))
    .map((id) => ({
      source: 'malMangaPage',
      entityId: `manga_page_${id}`,
      taskType: 'manga_page_hydration',
      priority: 10,
      status: 'pending' as const,
      payload: { mangaId: id },
    }))

  if (tasks.length > 0) await taskRepository.createManyTasks(tasks)
  console.log(`✓ Created ${tasks.length} manga page tasks`)
}
