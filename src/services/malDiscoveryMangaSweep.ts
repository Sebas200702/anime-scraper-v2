import { MANGA_SWEEP_LIMITS } from '../config/malDiscovery.js'
import { FetchError } from '../libs/httpError.js'
import type { MalMangaNode } from './malManga.js'

/** Nodos por página del ranking de MAL (`limit=500`). */
export const SWEEP_PAGE_SIZE = 500

/** Tope del `Retry-After` que se respeta entre intentos de una página. */
const MAX_RETRY_AFTER_MS = 60_000

export type MangaSweepLimits = typeof MANGA_SWEEP_LIMITS

export interface MangaSweepDeps {
  /** Offset desde el que se reanuda (cursor del payload). */
  startOffset: number
  fetchPage: (offset: number) => Promise<MalMangaNode[]>
  /** Guarda los desconocidos de una página; devuelve los insertados. */
  savePage: (nodes: MalMangaNode[]) => Promise<number>
  /** Persiste el siguiente offset (0 al terminar el barrido). */
  saveCursor: (offset: number) => Promise<void>
  limits?: MangaSweepLimits
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export interface MangaSweepResult {
  /** Llegó a una página corta: el barrido terminó y el cursor volvió a 0. */
  done: boolean
  nextOffset: number
  pages: number
  inserted: number
}

/** Cursor válido del payload: entero ≥ 0 múltiplo de 500; si no, 0. */
export const sweepCursor = (value: unknown): number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value % SWEEP_PAGE_SIZE === 0
    ? value
    : 0

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Barrido reanudable del ranking de manga (S6, L9): cada página se guarda al
 * llegar y el cursor avanza tras guardarla, así un fallo no descarta lo ya
 * traído y el reintento sigue donde quedó. Un timeout/5xx/red reintenta esa
 * página con backoff; agotados los intentos el error sube (la tarea falla con
 * el cursor intacto). El intento corta al agotar páginas o tiempo y devuelve
 * `done: false`; con una página corta el barrido termina y el cursor vuelve a
 * 0 para la próxima pasada semanal.
 */
export const runMangaSweep = async (
  deps: MangaSweepDeps
): Promise<MangaSweepResult> => {
  const limits = deps.limits ?? MANGA_SWEEP_LIMITS
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? defaultSleep
  const startedAt = now()
  let offset = deps.startOffset
  let pages = 0
  let inserted = 0

  for (;;) {
    if (
      pages >= limits.pageBudget ||
      (pages > 0 && now() - startedAt >= limits.timeBudgetMs)
    )
      return { done: false, nextOffset: offset, pages, inserted }

    const nodes = await fetchWithRetry(deps.fetchPage, offset, limits, sleep)
    inserted += await deps.savePage(nodes)
    pages++

    if (nodes.length < SWEEP_PAGE_SIZE) {
      await deps.saveCursor(0)
      return { done: true, nextOffset: 0, pages, inserted }
    }
    offset += SWEEP_PAGE_SIZE
    await deps.saveCursor(offset)
  }
}

const fetchWithRetry = async (
  fetchPage: MangaSweepDeps['fetchPage'],
  offset: number,
  limits: MangaSweepLimits,
  sleep: (ms: number) => Promise<void>
): Promise<MalMangaNode[]> => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchPage(offset)
    } catch (error) {
      const retryable = error instanceof FetchError && error.retryable
      if (!retryable || attempt >= limits.pageAttempts) throw error
      const delay =
        error.retryAfterMs !== undefined
          ? Math.min(error.retryAfterMs, MAX_RETRY_AFTER_MS)
          : limits.backoffMs * 2 ** (attempt - 1)
      console.warn(
        `↻ manga ranking offset ${offset}: ${error.kind} (intento ${attempt}/${limits.pageAttempts}) — espera ${delay}ms`
      )
      await sleep(delay)
    }
  }
}
