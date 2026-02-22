import { taskRepository } from '../repositories/tasks.js'
import {
  fetchAnimeThemesSlugs,
  fetchArtistsSlugs,
} from '../services/animeThemes.js'

export const initializeAnimeThemesTasks = async () => {
  try {
    const existing = await taskRepository.getExistingEntityIds('animeThemes')
    console.log(
      `Found ${existing.size} existing animeThemes tasks — skipping those`
    )

    console.log('Fetching anime slugs from AnimeThemes API...')
    const response = await fetchAnimeThemesSlugs()
    const animes = response.pageProps.animeAll

    console.log(`Found ${animes.length} anime slugs from AnimeThemes`)

    console.log('Fetching artist slugs from AnimeThemes API...')
    const responseArtists = await fetchArtistsSlugs()
    const artists = responseArtists.pageProps.artistAll

    console.log(`Found ${artists.length} artist slugs from AnimeThemes`)

    const batchSize = 2000
    let totalCreated = 0

    // Crear tareas para anime slugs en lotes
    for (let i = 0; i < animes.length; i += batchSize) {
      const batch = animes.slice(i, i + batchSize)
      const tasks = batch
        .filter((anime: { slug: string }) => !existing.has(anime.slug))
        .map((anime: { slug: string }) => ({
          entityType: 'animeThemes',
          entityId: anime.slug,
          taskType: 'anime_themes_hydration',
          priority: 10,
          status: 'pending',
          payload: { slug: anime.slug },
        }))

      if (tasks.length > 0) {
        await taskRepository.createManyTasks(tasks)
        totalCreated += tasks.length
        console.log(
          `Anime batch: ${tasks.length} new tasks (total: ${totalCreated})`
        )
      }
    }

    // Crear tareas para artist slugs en lotes
    for (let i = 0; i < artists.length; i += batchSize) {
      const batch = artists.slice(i, i + batchSize)
      const tasks = batch
        .filter((artist: { slug: string }) => !existing.has(artist.slug))
        .map((artist: { slug: string }) => ({
          entityType: 'animeThemes',
          entityId: artist.slug,
          taskType: 'artist_hydration',
          priority: 5,
          status: 'pending',
          payload: { slug: artist.slug },
        }))

      if (tasks.length > 0) {
        await taskRepository.createManyTasks(tasks)
        totalCreated += tasks.length
        console.log(
          `Artist batch: ${tasks.length} new tasks (total: ${totalCreated})`
        )
      }
    }

    console.log(
      `✓ Created ${totalCreated} new animeThemes tasks (${existing.size} already existed)`
    )
  } catch (error) {
    console.error('Error initializing animeThemes tasks:', error)
  }
}
