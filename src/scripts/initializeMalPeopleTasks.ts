import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'

/**
 * Siembra una tarea por **persona sin retrato**.
 *
 * La ficha del anime solo lista ~12 miembros del staff, así que sus retratos
 * quedaban a medias; la ficha de la persona los completa.
 */
export const initializeMalPeopleTasks = async () => {
  const existing = await taskRepository.getExistingEntityIds('malPeople')
  console.log(`Found ${existing.size} existing malPeople tasks — skipping those`)

  const missing = await db.execute(sql`
    SELECT s.mal_id FROM staff s
    WHERE NOT EXISTS (SELECT 1 FROM staff_media m WHERE m.staff_id = s.mal_id)
    ORDER BY s.mal_id
  `)

  const tasks = (missing.rows as unknown as { mal_id: number }[])
    .map((row) => row.mal_id)
    .filter((id) => !existing.has(`staff_image_${id}`))
    .map((id) => ({
      source: 'malPeople',
      entityId: `staff_image_${id}`,
      taskType: 'staff_image_hydration',
      priority: 20,
      status: 'pending' as const,
      payload: { staffId: id },
    }))

  if (tasks.length > 0) await taskRepository.createManyTasks(tasks)
  console.log(`✓ Created ${tasks.length} staff image tasks`)
}
