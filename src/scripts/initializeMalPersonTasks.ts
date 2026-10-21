import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'

/**
 * Siembra una tarea por **persona** de MAL (el staff).
 *
 * Ojo: el id de **personaje** de MAL vive en un espacio distinto del de
 * persona (`/character/{id}` ≠ `/people/{id}`), así que la ficha de persona no
 * sirve para los personajes: 404 en casi todos. Los personajes se nombran con
 * la página de personajes del anime (`malCharacters`), que además trae el
 * retrato y las voces.
 */
export const initializeMalPersonTasks = async () => {
  const existing = await taskRepository.getExistingEntityIds('malPerson')
  console.log(
    `Found ${existing.size} existing malPerson tasks — skipping those`
  )

  const rows = (
    await db.execute(sql`
      SELECT s.mal_id AS id, 'staff' AS kind FROM staff s ORDER BY s.mal_id
    `)
  ).rows as unknown as { id: number; kind: 'staff' | 'character' }[]

  const tasks = rows
    .filter((row) => !existing.has(`person_${row.id}`))
    .map((row) => ({
      source: 'malPerson',
      entityId: `person_${row.id}`,
      taskType: 'person_mal_details_hydration',
      priority: 10,
      status: 'pending' as const,
      payload: { personId: row.id, kind: row.kind },
    }))

  if (tasks.length > 0) await taskRepository.createManyTasks(tasks)
  console.log(`✓ Created ${tasks.length} person detail tasks`)
}
