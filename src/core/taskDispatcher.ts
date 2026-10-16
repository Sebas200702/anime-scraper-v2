/**
 * Orquestador de ingesta: reparte las tareas entre las IPs disponibles,
 * respeta la cuota por (host, IP) y alimenta el pool con el resultado.
 *
 * Vive en el proceso padre (decisión D-S1): es el único que conoce la cuota
 * global, qué proxy se usó en cada request y qué causa tuvo cada fallo. El
 * trabajo real (`run`) se inyecta, así que es testeable sin red.
 */
import type { ProxyState } from 'types/index.js'
import { FetchError } from '../libs/httpError.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import { type RateLimits, RateGate, proxyKey } from './rateGate.js'

export interface DispatcherTask {
  id: number
  taskType: string
}

export interface DispatchHooks<T> {
  /** Ejecuta la tarea (fetch + mapeo) usando la IP indicada. */
  run: (task: DispatcherTask, proxyUrl: string | undefined) => Promise<T>
  onDone: (
    task: DispatcherTask,
    data: T,
    proxyUrl?: string
  ) => Promise<void> | void
  onError: (
    task: DispatcherTask,
    error: unknown,
    proxyUrl?: string
  ) => Promise<void> | void
}

export interface DispatchSummary {
  processed: number
  failed: number
  /** Fallos por causa (`FetchError.kind`), para el registro de la corrida. */
  byKind: Record<string, number>
  /** IPs de salida realmente usadas en la corrida. */
  proxiesUsed: number
}

export interface TaskDispatcherOptions {
  /** Cuántas tareas pueden estar en vuelo a la vez. */
  maxInFlight: number
  gate: RateGate
  acquireProxy: () => ProxyState | undefined
  /** Host y cuota de la tarea (la clave del gate añade la IP de salida). */
  limitsFor: (task: DispatcherTask) => { host: string; limits: RateLimits }
  /**
   * Se invoca al terminar cada tarea: sin error = éxito (limpia el proxy),
   * con error = fallo atribuible al proxy (`FetchError.proxyFault`).
   */
  reportProxy?: (proxyUrl: string | undefined, error?: FetchError) => void
  onProgress?: (summary: DispatchSummary) => void
}

export class TaskDispatcher {
  constructor(private readonly options: TaskDispatcherOptions) {}

  async drain<T>(
    tasks: DispatcherTask[],
    hooks: DispatchHooks<T>
  ): Promise<DispatchSummary> {
    const queue = [...tasks]
    const summary: DispatchSummary = {
      processed: 0,
      failed: 0,
      byKind: {},
      proxiesUsed: 0,
    }
    const usedProxies = new Set<string>()

    const runners = Array.from(
      { length: Math.max(1, Math.min(this.options.maxInFlight, queue.length)) },
      async () => {
        for (;;) {
          const task = queue.shift()
          if (!task) return
          await this.dispatchOne(task, hooks, summary, usedProxies)
        }
      }
    )

    await Promise.all(runners)
    summary.proxiesUsed = usedProxies.size
    return summary
  }

  private async dispatchOne<T>(
    task: DispatcherTask,
    hooks: DispatchHooks<T>,
    summary: DispatchSummary,
    usedProxies: Set<string>
  ): Promise<void> {
    const proxy = this.options.acquireProxy()
    const proxyUrl = proxy?.url
    if (proxyUrl) usedProxies.add(proxyUrl)

    const { host, limits } = this.options.limitsFor(task)
    const key = proxyKey(host, proxyUrl)

    // Cuota por (host, IP): con una IP por tarea, cada una va a su cuota.
    await this.options.gate.acquire(key, limits)

    try {
      const data = await hooks.run(task, proxyUrl)
      this.options.reportProxy?.(proxyUrl)
      await hooks.onDone(task, data, proxyUrl)
      summary.processed++
    } catch (error) {
      const fetchError = error instanceof FetchError ? error : undefined

      // Solo se penaliza al proxy si el fallo es atribuible a la IP (H-07):
      // un 404, un 429 o credenciales inválidas son de la fuente.
      if (fetchError?.proxyFault) {
        this.options.reportProxy?.(proxyUrl, fetchError)
      }

      // `Retry-After`: se pausa esa (host, IP) concreta, no todas.
      if (fetchError?.kind === 'rate_limit' && fetchError.retryAfterMs) {
        this.options.gate.pause(key, fetchError.retryAfterMs)
      }

      const kind =
        error instanceof SkippedTaskError
          ? 'skipped'
          : (fetchError?.kind ?? 'unknown')
      summary.byKind[kind] = (summary.byKind[kind] ?? 0) + 1
      summary.failed++

      await hooks.onError(task, error, proxyUrl)
    }

    this.options.onProgress?.(summary)
  }
}
