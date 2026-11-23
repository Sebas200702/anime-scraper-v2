import { MAL_DISCOVERY_TASKS } from '../config/malDiscovery.js'
import { taskRepository } from '../repositories/tasks.js'

/**
 * Siembra las tareas de descubrimiento (temporada actual y siguiente,
 * rankings `upcoming` y `airing` de anime, ranking `bypopularity` de manga). Idempotente: `ON CONFLICT DO NOTHING`; el
 * refresco diario lo hace la política (`rearmDueTasks`).
 */
export const initializeMalDiscoveryTasks = async () => {
  const created = await taskRepository.createManyTasks([...MAL_DISCOVERY_TASKS])
  console.log(`✓ Created ${created} malDiscovery tasks`)
}
