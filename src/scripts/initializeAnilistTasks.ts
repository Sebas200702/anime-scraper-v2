import { taskRepository } from '../repositories/tasks.js'

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
}
