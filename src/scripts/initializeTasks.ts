import { taskRepository } from '../repositories/tasks.js'
import {
  fetchAnimePage,
  fetchCharacterPage,
  fetchProducerPage,
  fetchStaffPage,
} from '../services/jikan.js'

const ENTITY_CONFIGS = [
  {
    name: 'character',
    fetchFunction: fetchCharacterPage,
    taskType: 'character_page_hydration',
  },
  {
    name: 'staff',
    fetchFunction: fetchStaffPage,
    taskType: 'staff_page_hydration',
  },
  {
    name: 'anime',
    fetchFunction: fetchAnimePage,
    taskType: 'anime_page_hydration',
  },
  {
    name: 'producer',
    fetchFunction: fetchProducerPage,
    taskType: 'producer_page_hydration',
  },
]

const fetchEntityMetadata = async (config: {
  name: string
  fetchFunction: (page: number, agent?: any) => Promise<any>
  taskType: string
}) => {
  const json = await config.fetchFunction(1)
  const total = json.pagination.items.total
  const perPage = json.pagination.items.per_page
  const totalPages = Math.ceil(total / perPage)

  console.log(
    `Total ${config.name}s in Jikan: ${total}, per page: ${perPage}, pages: ${totalPages}`
  )

  return { totalPages, name: config.name, taskType: config.taskType }
}

export const initializeTasks = async () => {
  try {
    const existing = await taskRepository.getExistingEntityIds('jikan')
    console.log(`Found ${existing.size} existing jikan tasks — skipping those`)

    const entityMetadataList = await Promise.all(
      ENTITY_CONFIGS.map(fetchEntityMetadata)
    )

    const batchSize = 1000
    let totalCreated = 0

    for (const metadata of entityMetadataList) {
      const allTasks = []
      for (let page = 1; page <= metadata.totalPages; page++) {
        const entityId = `${metadata.name}_${page}`
        if (existing.has(entityId)) continue
        allTasks.push({
          entityType: 'jikan',
          entityId,
          taskType: metadata.taskType,
          priority: 5,
          status: 'pending',
          payload: { page },
        })
      }

      // Insertar en lotes
      for (let i = 0; i < allTasks.length; i += batchSize) {
        const batch = allTasks.slice(i, i + batchSize)
        await taskRepository.createManyTasks(batch)
        totalCreated += batch.length
        console.log(
          `${metadata.name} batch: ${batch.length} tasks (total: ${totalCreated})`
        )
      }
    }

    console.log(
      `✓ Created ${totalCreated} new Jikan tasks (${existing.size} already existed)`
    )
  } catch (error) {
    console.error('Error initializing Jikan hydration tasks:', error)
  }
}
