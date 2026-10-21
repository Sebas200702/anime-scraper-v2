import { taskRepository } from '../repositories/tasks.js'
import { db } from '../libs/db.js'
import { animeExternalIds } from '../schemas/animeExternal.js'

/**
 * Backfill de AniList en **bulk**: una tarea por año de emisión (la fuente
 * pagina internamente, 50 anime por request). ~87 tareas y ~500 requests en vez
 * de 30.561 tareas y ~30.000 requests.
 *
 * El taskType por-anime (`anime_banner_hydration`) queda declarado para el
 * refresh del Modo B (una tarea por anime due), pero **no se siembra aquí**:
 * en backfill el bulk ya cubre todo lo que tiene `seasonYear`.
 */
export const initializeAnilistTasks = async () => {
  const existingYears = await taskRepository.getExistingEntityIds('anilist')
  console.log(
    `Found ${existingYears.size} existing anilist tasks — skipping those`
  )

  const thisYear = new Date().getUTCFullYear()
  const yearTasks = []
  for (let year = 1940; year <= thisYear; year++) {
    const entityId = `anilist_year_${year}`
    if (existingYears.has(entityId)) continue
    yearTasks.push({
      source: 'anilist',
      entityId,
      taskType: 'anilist_year_hydration',
      priority: 20,
      status: 'pending',
      payload: { year },
    })
  }
  if (yearTasks.length > 0) await taskRepository.createManyTasks(yearTasks)
  console.log(`✓ Created ${yearTasks.length} anilist catalog year tasks`)

  // Tarea por anime **con id de AniList**: el bulk por año cubre el catálogo,
  // pero las relaciones (y los banners) solo quedaron para los animes que
  // tocaron esas páginas. Con una tarea por anime (1 request) se cierran las
  // relaciones de todo lo que AniList conoce.
  // `SCRAPER_ANILIST_PER_ANIME=0` lo desactiva.
  if (process.env.SCRAPER_ANILIST_PER_ANIME === '0') {
    console.log('· banner/relations por anime desactivado')
    return
  }
  const existingBanners = await taskRepository.getExistingEntityIds('anilist')
  const withAnilistId = await db
    .select({ animeId: animeExternalIds.animeId })
    .from(animeExternalIds)
    .orderBy(animeExternalIds.animeId)
  const bannerTasks = withAnilistId
    .filter((a) => !existingBanners.has(`anime_banner_${a.animeId}`))
    .map((a) => ({
      source: 'anilist',
      entityId: `anime_banner_${a.animeId}`,
      taskType: 'anime_banner_hydration',
      priority: 15,
      status: 'pending' as const,
      payload: { animeId: a.animeId },
    }))
  if (bannerTasks.length > 0) {
    for (let i = 0; i < bannerTasks.length; i += 5000) {
      await taskRepository.createManyTasks(bannerTasks.slice(i, i + 5000))
    }
  }
  console.log(`✓ Created ${bannerTasks.length} anilist per-anime tasks`)
}

