/**
 * Pase de enlace AniList de manga (S6, L14): una tarea única bajo la fuente
 * `anilist` (comparte el gate de `graphql.anilist.co`) que rellena
 * `manga_external_ids.anilist_id` de los manga que no lo tienen, en bloques de
 * 50 `idMal` por request. Sin ese id, `initializeAnilistMediaTasks` (reparto y
 * staff de AniList) nunca llega a los manga descubiertos por MAL.
 */
export const ANILIST_MANGA_LINK_TASK = 'manga_anilist_link_hydration'
export const ANILIST_MANGA_LINK_ENTITY = 'anilist_manga_link'

/**
 * Tope por intento, como el barrido de manga (L9): 40 páginas a ≤ 25/min son
 * ~100 s, bajo los 180 s y lejos del lease (900 s) y del deadline (600 s).
 * Mutable solo para los tests.
 */
export const ANILIST_MANGA_LINK_LIMITS = {
  /** `idMal` por request (`Page(perPage: 50)`). */
  batchSize: 50,
  pageBudget: 40,
  timeBudgetMs: 180_000,
}

export interface AnilistMangaLinkTask {
  source: 'anilist'
  entityId: string
  taskType: string
  priority: number
  status: 'pending'
  payload: { afterMalId: number }
}

/** Singleton: el cursor (`afterMalId`) vive en su payload. */
export const ANILIST_MANGA_LINK_TASKS: readonly AnilistMangaLinkTask[] = [
  {
    source: 'anilist',
    entityId: ANILIST_MANGA_LINK_ENTITY,
    taskType: ANILIST_MANGA_LINK_TASK,
    // Por delante de los banners (15) y años (20): es una sola tarea barata.
    priority: 25,
    status: 'pending',
    payload: { afterMalId: 0 },
  },
]
