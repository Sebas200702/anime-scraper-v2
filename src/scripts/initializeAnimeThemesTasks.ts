import { taskRepository } from '../repositories/tasks.js'
import {
  fetchAnimeThemesSlugs,
  fetchArtistsSlugs,
} from '../services/animeThemes.js'

export const initializeAnimeThemesTasks = async () => {
  try {
    console.log('Fetching anime slugs from AnimeThemes API...')

    // Obtener todos los slugs del endpoint
    const response = await fetchAnimeThemesSlugs()
    const animes = response.pageProps.animeAll

    console.log(`Found ${animes.length} anime slugs from AnimeThemes`)

    console.log('Fetching artist slugs from AnimeThemes API...')
    const responseArtists = await fetchArtistsSlugs()
    const artists = responseArtists.pageProps.artistAll

    console.log(`Found ${artists.length} artist slugs from AnimeThemes`)

    // Verificar qué tareas ya están completadas
    console.log('Checking for existing completed tasks...')
    const completedTasks = await taskRepository.getTasks(
      'animeThemes'
    )

    console.log(
      `Found ${completedTasks.length} already completed/in-progress animeThemes tasks`
    )

    const batchSize = 2000
    let tasks = []
    let totalCreated = 0

    // Crear tareas para cada anime usando slug
    for (const anime of animes) {
      const slug = anime.slug

      // Verificar si ya existe la tarea
      if (!completedTasks.some((task) => task.entityId === slug)) {
        tasks.push({
          entityType: 'animeThemes',
          entityId: slug,
          taskType: 'anime_themes_hydration',
          priority: 10,
          status: 'pending',
          payload: { slug },
        })

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

    // Crear tareas para cada artista usando slug
    for (const artist of artists) {
      const slug = artist.slug

      // Verificar si ya existe la tarea
      if (!completedTasks.some((task) => task.entityId === slug)) {
        tasks.push({
          entityType: 'animeThemes',
          entityId: slug,
          taskType: 'artist_hydration',
          priority: 5,
          status: 'pending',
          payload: { slug },
        })

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
      console.log(
        '✓ All animeThemes tasks are already completed or in progress!'
      )
      return
    }

    console.log(
      `✓ Created ${totalCreated} new animeThemes hydration tasks (${completedTasks.length} already existed)`
    )
  } catch (error) {
    console.error('Error initializing animeThemes tasks:', error)
  }
}
