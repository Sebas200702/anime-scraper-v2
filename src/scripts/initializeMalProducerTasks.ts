import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'
import { producer } from '../schemas/producer.js'

/**
 * Siembra una tarea por productor/estudio (ficha HTML de MAL) para traer su
 * **logo**, `established` y descripción — datos que la API v2 no expone.
 *
 * Idempotente: solo crea las que faltan. Es un relleno one-off; el logo de un
 * estudio no cambia, así que la política de refresh es `null`.
 */
export const initializeMalProducerTasks = async () => {
  const existing = await taskRepository.getExistingEntityIds('malProducer')
  console.log(
    `Found ${existing.size} existing malProducer tasks — skipping those`
  )

  const rows = await db
    .select({ malId: producer.malId })
    .from(producer)
    .orderBy(producer.malId)

  const tasks = rows
    .map((row) => row.malId)
    .filter((id) => !existing.has(`producer_logo_${id}`))
    .map((id) => ({
      source: 'malProducer',
      entityId: `producer_logo_${id}`,
      taskType: 'producer_logo_hydration',
      priority: 10,
      status: 'pending' as const,
      payload: { producerId: id },
    }))

  for (let i = 0; i < tasks.length; i += 2000) {
    await taskRepository.createManyTasks(tasks.slice(i, i + 2000))
  }

  console.log(`✓ Created ${tasks.length} producer logo tasks`)
}
