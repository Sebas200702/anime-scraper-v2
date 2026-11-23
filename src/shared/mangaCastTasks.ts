/**
 * Tareas del reparto de manga desde MAL (`manga_mal_characters_hydration`).
 * Puro: el inicializador las crea con `taskRepository.createManyTasks`
 * (`ON CONFLICT DO NOTHING` sobre la identidad source/taskType/entityId).
 */
export const MANGA_CAST_SOURCE = 'malMangaCharacters'
export const MANGA_CAST_TASK_TYPE = 'manga_mal_characters_hydration'

export const mangaCastEntityId = (mangaId: number) => `manga_cast_${mangaId}`

/** Una tarea por manga que todavía no tiene la suya (cualquier estado). */
export const mangaCastTaskRows = (
  mangaIds: number[],
  existingEntityIds: Set<string>
) =>
  mangaIds
    .filter((id) => !existingEntityIds.has(mangaCastEntityId(id)))
    .map((id) => ({
      source: MANGA_CAST_SOURCE,
      entityId: mangaCastEntityId(id),
      taskType: MANGA_CAST_TASK_TYPE,
      priority: 10,
      status: 'pending' as const,
      payload: { mangaId: id },
    }))
