import { ANILIST_MANGA_LINK_TASKS } from '../config/anilistMangaLink.js'
import { taskRepository } from '../repositories/tasks.js'

/**
 * Siembra la tarea única del enlace AniList de manga (S6, L14). Idempotente:
 * `ON CONFLICT DO NOTHING` nunca pisa el cursor del payload; el refresco
 * diario lo hace la política (`rearmDueTasks`).
 */
export const initializeAnilistMangaLinkTasks = async () => {
  const created = await taskRepository.createManyTasks([
    ...ANILIST_MANGA_LINK_TASKS,
  ])
  console.log(`✓ Created ${created} anilist manga link tasks`)
}
