import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'
import {
  MANGA_CAST_SOURCE,
  mangaCastTaskRows,
} from '../shared/mangaCastTasks.js'

/**
 * Siembra una tarea por manga para traer su **reparto** de la página de
 * personajes de MAL (ids reales de personaje). Idempotente: solo crea lo que
 * falta.
 *
 * Carga inicial (one-off, ~20 h a 1 req/s con una IP):
 *   bun src/scripts/incremental.ts --drain --sources=malMangaCharacters --budget=80000 --deadline=86400
 */
export const initializeMalMangaCharactersTasks = async () => {
  const existing = await taskRepository.getExistingEntityIds(MANGA_CAST_SOURCE)
  console.log(
    `Found ${existing.size} existing ${MANGA_CAST_SOURCE} tasks — skipping those`
  )

  const rows = (
    await db.execute(sql`SELECT mal_id FROM manga ORDER BY mal_id`)
  ).rows as unknown as { mal_id: number }[]

  const tasks = mangaCastTaskRows(
    rows.map((row) => row.mal_id),
    existing
  )
  for (let i = 0; i < tasks.length; i += 5000)
    await taskRepository.createManyTasks(tasks.slice(i, i + 5000))
  console.log(`✓ Created ${tasks.length} manga cast tasks`)
}

if (import.meta.main) {
  const { closeDb } = await import('../libs/db.js')
  try {
    await initializeMalMangaCharactersTasks()
  } catch (error) {
    console.error('Fatal initializeMalMangaCharactersTasks:', error)
    process.exitCode = 1
  } finally {
    await closeDb()
  }
}
