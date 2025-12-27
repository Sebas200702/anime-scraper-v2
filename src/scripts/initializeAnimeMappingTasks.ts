import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'
import { anime, animeTitleSynonym } from '../schemas/anime.js'
import { eq } from 'drizzle-orm'

export const initializeAnimeMappingTasks = async () => {
  try {
    console.log('Fetching anime data from database in batches...')

    const completedTasks = await taskRepository.getCompletedTasks(
      null,
      'animeMapping'
    )
    console.log(
      `Found ${completedTasks.length} already completed/in-progress animeMapping tasks`
    )

    const fetchBatchSize = 5000
    const taskBatchSize = 5000
    let offset = 0
    let totalAnimes = 0
    let totalCreated = 0
    let hasMore = true

    while (hasMore) {
      const animes = await db
        .select({
          malId: anime.malId,
          title: anime.title,
          titleJapanese: anime.titleJapanese,
          titleEnglish: anime.titleEnglish,
          year: anime.year,
          type: anime.type,
          titleSynonyms: animeTitleSynonym.title,
        })
        .from(anime)
        .innerJoin(
          animeTitleSynonym,
          eq(anime.malId, animeTitleSynonym.animeId)
        )
        .limit(fetchBatchSize)
        .offset(offset)

      if (!animes || animes.length === 0) {
        break
      }

      totalAnimes += animes.length
      console.log(`Fetched ${animes.length} anime (total: ${totalAnimes})`)

      let tasks = []

      // Crear tareas para cada anime
      for (const anime of animes) {
        const entityId = `anime_mapping_${anime.malId}`

        // Verificar si ya existe la tarea
        if (!completedTasks.some((task) => task.entityId === entityId)) {
          tasks.push({
            entityType: 'animeMapping',
            entityId: entityId,
            taskType: 'anime_mapping_hydration',
            priority: 5,
            status: 'pending',
            payload: {
              title: anime.title,
              title_japanese: anime.titleJapanese,
              title_english: anime.titleEnglish,
              title_synonyms: anime.titleSynonyms,
              year: anime.year,
              type: anime.type,
            },
          })

          // Guardar en lotes de 5000
          if (tasks.length >= taskBatchSize) {
            console.log(`Creating batch of ${tasks.length} tasks...`)
            await taskRepository.createManyTasks(tasks)
            totalCreated += tasks.length
            console.log(`✓ Created ${totalCreated} tasks so far`)
            tasks = []
          }
        }
      }

      // Guardar tareas restantes del lote
      if (tasks.length > 0) {
        console.log(`Creating batch of ${tasks.length} tasks...`)
        await taskRepository.createManyTasks(tasks)
        totalCreated += tasks.length
        console.log(`✓ Created ${totalCreated} tasks so far`)
      }

      // Si recibimos menos registros que el tamaño del lote, no hay más
      if (animes.length < fetchBatchSize) {
        hasMore = false
      } else {
        offset += fetchBatchSize
      }
    }

    if (totalCreated === 0) {
      console.log(
        '✓ All animeMapping tasks are already completed or in progress!'
      )
      return
    }

    console.log(
      `✓ Created ${totalCreated} new animeMapping hydration tasks (${completedTasks.length} already existed)`
    )
  } catch (error) {
    console.error('Error initializing animeMapping tasks:', error)
  }
}
