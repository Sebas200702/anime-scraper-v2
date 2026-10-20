import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'

/**
 * Siembra una tarea por **persona** de MAL (staff o personaje).
 *
 * El id de MAL de un personaje es un id de persona, así que la misma ficha
 * `/v2/people/{id}` sirve para ambos: trae el nombre (el de los personajes
 * nunca se había guardado, salvo los 10 de la ficha HTML), la biografía, los
 * alias y el retrato.
 */
export const initializeMalPersonTasks = async () => {
  const existing = await taskRepository.getExistingEntityIds('malPerson')
  console.log(
    `Found ${existing.size} existing malPerson tasks — skipping those`
  )

  const rows = (
    await db.execute(sql`
      SELECT DISTINCT person_id AS id, kind FROM (
        SELECT s.mal_id AS person_id, 'staff' AS kind FROM staff s
        UNION ALL
        SELECT c.character_id AS person_id, 'character' AS kind
        FROM anime_character c
      ) t
      ORDER BY id
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
