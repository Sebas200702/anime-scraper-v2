import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'

/**
 * Siembra una tarea por **obra impresa** (manga, novela, one-shot) para
 * traer su ficha completa de MAL: sinopsis, capítulos, serialización,
 * editorial, relaciones y portada.
 */
export const initializeMalMangaTasks = async () => {
  const existing = await taskRepository.getExistingEntityIds('malManga')
  console.log(`Found ${existing.size} existing malManga tasks — skipping those`)

  const rows = (
    await db.execute(sql`
      SELECT mal_id FROM manga ORDER BY mal_id
    `)
  ).rows as unknown as { mal_id: number }[]

  const tasks = rows
    .map((row) => row.mal_id)
    .filter((id) => !existing.has(`manga_${id}`))
    .map((id) => ({
      source: 'malManga',
      entityId: `manga_${id}`,
      taskType: 'manga_mal_details_hydration',
      priority: 10,
      status: 'pending' as const,
      payload: { mangaId: id },
    }))

  if (tasks.length > 0) await taskRepository.createManyTasks(tasks)
  console.log(`✓ Created ${tasks.length} manga detail tasks`)
}
