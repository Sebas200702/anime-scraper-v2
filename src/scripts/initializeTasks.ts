import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'
import { anime } from '../schemas/anime.js'
import { character } from '../schemas/character.js'
import { producer } from '../schemas/producer.js'
import { staff } from '../schemas/staff.js'
import {
  fetchAnimePage,
  fetchCharacterPage,
  fetchProducerPage,
  fetchStaffPage,
} from '../services/jikan.js'
import type { DataType, JikanResponse } from 'types/jikanApi.js'

/**
 * Descubrimiento **delta** del listado de Jikan.
 *
 * El listado viene ordenado por `mal_id` ascendente: lo nuevo se anexa al
 * final. En vez de crear una tarea por cada página histórica, se calcula el
 * cursor (`MAX(mal_id)` conocido) y se siembran solo las últimas páginas. Las
 * páginas viejas no se re-barren nunca: la frescura del catálogo terminado la
 * da la ficha `/full` (solo airing) y el descubrimiento de nuevos ids.
 */
const ENTITY_CONFIGS = [
  {
    name: 'character',
    fetchFunction: fetchCharacterPage,
    taskType: 'character_page_hydration',
    table: character,
    idColumn: character.malId,
  },
  {
    name: 'staff',
    fetchFunction: fetchStaffPage,
    taskType: 'staff_page_hydration',
    table: staff,
    idColumn: staff.malId,
  },
  {
    name: 'anime',
    fetchFunction: fetchAnimePage,
    taskType: 'anime_page_hydration',
    table: anime,
    idColumn: anime.malId,
  },
  {
    name: 'producer',
    fetchFunction: fetchProducerPage,
    taskType: 'producer_page_hydration',
    table: producer,
    idColumn: producer.malId,
  },
] as const

const fetchEntityMetadata = async (config: {
  name: string
  fetchFunction: (page: number) => Promise<JikanResponse<DataType>>
  taskType: string
}) => {
  const json = await config.fetchFunction(1)
  const total = json.pagination.items.total
  const perPage = json.pagination.items.per_page || 25
  const totalPages = Math.ceil(total / perPage)

  console.log(
    `Total ${config.name}s in Jikan: ${total}, per page: ${perPage}, pages: ${totalPages}`
  )

  return { totalPages, perPage, name: config.name, taskType: config.taskType }
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

    for (const [index, metadata] of entityMetadataList.entries()) {
      const config = ENTITY_CONFIGS[index]!
      // Cursor: solo las últimas páginas (margen de 2 por si una página nueva
      // aún no tiene ids en nuestra tabla). Escaneo barato, sin re-barrido.
      const cursorRow = await db.execute(
        sql`SELECT coalesce(max(${config.idColumn}), 0)::int AS max_id FROM ${config.table}`
      )
      const maxId =
        (cursorRow.rows[0] as { max_id: number } | undefined)?.max_id ?? 0
      const cursorPage = Math.max(1, Math.floor(maxId / metadata.perPage) - 2)

      const allTasks = []
      for (let page = cursorPage; page <= metadata.totalPages; page++) {
        const entityId = `${metadata.name}_${page}`
        if (existing.has(entityId)) continue
        allTasks.push({
          source: 'jikan',
          entityId,
          taskType: metadata.taskType,
          priority: 5,
          status: 'pending' as const,
          payload: { page },
        })
      }

      for (let i = 0; i < allTasks.length; i += batchSize) {
        const batch = allTasks.slice(i, i + batchSize)
        await taskRepository.createManyTasks(batch)
        totalCreated += batch.length
      }

      console.log(
        `${metadata.name}: ${allTasks.length} páginas nuevas (desde pág. ${cursorPage} de ${metadata.totalPages})`
      )
    }

    console.log(
      `✓ Created ${totalCreated} new Jikan tasks (${existing.size} already existed)`
    )
  } catch (error) {
    console.error('Error initializing Jikan hydration tasks:', error)
  }
}
