import { taskRepository } from '../repositories/tasks.js'
import {
  fetchAnimePage,
  fetchCharacterPage,
  fetchProducerPage,
  fetchStaffPage,
} from '../services/jikan.js'
import type { ScrapingTask } from '../types/index.js'

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
    `Total ${config.name}s in Jikan: ${total}, ${config.name}s per page: ${perPage}`
  )
  console.log(`Total ${config.name} pages: ${totalPages}`)

  return { totalPages, name: config.name, taskType: config.taskType }
}

const createTasksForEntity = (
  metadata: { totalPages: number; name: string; taskType: string },
  completedPages: ScrapingTask[]
) => {
  const tasks = []
  for (let page = 1; page <= metadata.totalPages; page++) {
    const entityId = `${metadata.name}_${page}`
    if (!completedPages.some((task) => task.entityId === entityId)) {
      // Ensure payload is always a non-null object
      const safePage = page ?? 1
      tasks.push({
        entityType: 'jikan',
        entityId: entityId,
        taskType: metadata.taskType,
        priority: 5,
        status: 'pending',
        payload: { page: safePage },
      })
    }
  }
  return tasks
}

export const initializeTasks = async () => {
  try {
    // Obtener metadatos de todas las entidades
    const entityMetadataList = await Promise.all(
      ENTITY_CONFIGS.map(fetchEntityMetadata)
    )

    // Verificar qué tareas ya están completadas
    console.log('Checking for existing completed tasks...')
    const completedPages = await taskRepository.getTasks('jikan')
    console.log(
      `Found ${completedPages.length} already completed/in-progress tasks`
    )

    const batchSize = 1000
    let tasks = []
    let totalCreated = 0

    // Crear tareas para todas las entidades
    for (const metadata of entityMetadataList) {
      const entityTasks = createTasksForEntity(metadata, completedPages)

      for (const task of entityTasks) {
        tasks.push(task)

        // Guardar en lotes de 5000
        if (tasks.length >= batchSize) {
          console.log(`Creating batch of ${tasks.length} tasks...`)
          await taskRepository.createManyTasks(tasks)
          totalCreated += tasks.length
          console.log(`✓ Created ${totalCreated} tasks so far`)
          tasks = [] // Limpiar el array
        }
      }
    }

    // Guardar las tareas restantes
    if (tasks.length > 0) {
      console.log(`Creating final batch of ${tasks.length} tasks...`)
      await taskRepository.createManyTasks(tasks)
      totalCreated += tasks.length
    }

    if (totalCreated === 0) {
      console.log('✓ All tasks are already completed or in progress!')
      return
    }

    console.log(
      `✓ Created ${totalCreated} new Jikan hydration tasks (${completedPages.length} already existed)`
    )
  } catch (error) {
    console.error('Error initializing Jikan hydration tasks:', error)
  }
}
