import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'

/**
 * Siembra una tarea por anime para traer su **reparto completo** de MAL.
 *
 * La ficha HTML solo lista los diez primeros personajes de la sección
 * "Characters and Voice Actors"; `/v2/anime/{id}/characters` devuelve la
 * lista entera (las series largas llegan a varios cientos).
 */
export const initializeMalCharactersTasks = async () => {
  const existing = await taskRepository.getExistingEntityIds('malCharacters')
  console.log(
    `Found ${existing.size} existing malCharacters tasks — skipping those`
  )

  const rows = (await db.execute(sql`SELECT mal_id FROM anime ORDER BY mal_id`))
    .rows as unknown as { mal_id: number }[]

  const tasks = rows
    .map((row) => row.mal_id)
    .filter((id) => !existing.has(`anime_cast_${id}`))
    .map((id) => ({
      source: 'malCharacters',
      entityId: `anime_cast_${id}`,
      taskType: 'anime_mal_characters_hydration',
      priority: 10,
      status: 'pending' as const,
      payload: { animeId: id },
    }))

  if (tasks.length > 0) await taskRepository.createManyTasks(tasks)
  console.log(`✓ Created ${tasks.length} anime cast tasks`)
}
