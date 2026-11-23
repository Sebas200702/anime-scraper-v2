import { ANILIST_MANGA_LINK_LIMITS } from '../config/anilistMangaLink.js'
import type { AniListMangaLinkMedia } from '../types/anilistApi.js'

export type MangaLinkLimits = typeof ANILIST_MANGA_LINK_LIMITS

export interface MangaLinkPassDeps {
  /** `mal_id` tras el que se reanuda (cursor del payload). */
  startAfter: number
  /** Manga sin `anilist_id` con `mal_id > after`, en orden, hasta `limit`. */
  selectIds: (after: number, limit: number) => Promise<number[]>
  fetchPage: (ids: number[]) => Promise<AniListMangaLinkMedia[]>
  /** Escribe la página (solo-relleno); devuelve los enlazados. */
  savePage: (ids: number[], media: AniListMangaLinkMedia[]) => Promise<number>
  /** Persiste el cursor (0 al terminar la pasada). */
  saveCursor: (after: number) => Promise<void>
  /** Cupo del gate por request; la primera página ya lo pagó el dispatcher. */
  throttle?: () => Promise<void>
  limits?: MangaLinkLimits
  now?: () => number
}

export interface MangaLinkPassResult {
  /** No quedan manga sin id tras el cursor: la pasada terminó (cursor 0). */
  done: boolean
  cursor: number
  pages: number
  linked: number
}

/** Cursor válido del payload: entero ≥ 0; si no, 0. */
export const linkCursor = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0

/**
 * Pase de enlace AniList de manga (S6, L14). Cada página se escribe al llegar
 * y el cursor avanza al último `mal_id` **pedido** (lo conozca AniList o no),
 * así los ids desconocidos no se re-preguntan hasta la próxima pasada diaria.
 * Un fallo sube sin mover el cursor más allá de lo escrito. El intento corta
 * por páginas o tiempo (`done: false`); sin pendientes, el cursor vuelve a 0.
 */
export const runMangaLinkPass = async (
  deps: MangaLinkPassDeps
): Promise<MangaLinkPassResult> => {
  const limits = deps.limits ?? ANILIST_MANGA_LINK_LIMITS
  const now = deps.now ?? Date.now
  const startedAt = now()
  let cursor = deps.startAfter
  let pages = 0
  let linked = 0

  const finish = async (): Promise<MangaLinkPassResult> => {
    await deps.saveCursor(0)
    return { done: true, cursor: 0, pages, linked }
  }

  for (;;) {
    if (
      pages >= limits.pageBudget ||
      (pages > 0 && now() - startedAt >= limits.timeBudgetMs)
    )
      return { done: false, cursor, pages, linked }

    const ids = await deps.selectIds(cursor, limits.batchSize)
    if (ids.length === 0) return await finish()

    if (pages > 0) await deps.throttle?.()
    const media = await deps.fetchPage(ids)
    linked += await deps.savePage(ids, media)
    pages++

    cursor = ids[ids.length - 1] ?? cursor
    if (ids.length < limits.batchSize) return await finish()
    await deps.saveCursor(cursor)
  }
}
