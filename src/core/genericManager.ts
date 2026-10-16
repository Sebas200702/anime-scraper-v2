import { taskRepository } from '../repositories/tasks.js'
import { StatsReporter } from './statsReporter.js'
import { proxyManager } from './proxyManager.js'
import { RateGate } from './rateGate.js'
import { proxyKey } from './rateGate.js'
import { TaskDispatcher, type DispatcherTask } from './taskDispatcher.js'
import { SINGLE_IP_SOURCES, SOURCE_HOSTS } from '../config/sources.js'
import { KEY_SCOPED_HOSTS } from '../config/sources.js'
import { DEFAULT_REFRESH_SECONDS } from '../config/sources.js'
import { capitalize } from '../shared/parsers.js'
import { sanitizeError } from '../utils/sanitizeError.js'
import { FetchError } from '../libs/httpError.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import { takeDeferredDependencies } from '../shared/dependencyTracker.js'
import type {
  ScrapingTask,
  SourceConfig,
  BufferedTask,
} from '../types/index.js'

/**
 * Una sola puerta de rate para toda la corrida: si se recreara en cada lote, las
 * ventanas se resetearían y la cuota por (host, IP) no se respetaría.
 */
const rateGate = new RateGate()

/**
 * Ingesta de una fuente: el proceso padre fetchea y mapea (una tarea por IP,
 * con la cuota por (host, IP) aplicada por el `TaskDispatcher`), bufferiza por
 * tipo de tarea y guarda en lotes.
 *
 * Ya no hay `worker_threads`: a las tasas reales (≤ decenas de req/s) el trabajo
 * es I/O y el mapeo es liviano, y un solo proceso elimina las clases de fallo
 * de la etapa anterior (limiter por worker, un proxy fijo por worker, workers
 * colgados, `dist/` obligatorio, nada que reporte al pool).
 */
export class GenericManager {
  readonly maxWorkers: number
  readonly source: string
  sourceConfig: SourceConfig
  taskQueue: DispatcherTask[] = []
  pageBatch: number
  bufferByTaskType = new Map<string, BufferedTask[]>()

  private readonly savingByTaskType: Set<string> = new Set()
  private readonly refreshCache = new Map<string, number | undefined>()
  private cachedRepository: any = null
  private cachedModules: { services: any; processors: any } | null = null
  private statsInterval: ReturnType<typeof setInterval> | null = null
  private readonly reporter: StatsReporter

  constructor(sourceConfig: SourceConfig) {
    this.maxWorkers = sourceConfig.maxWorkers
    this.source = sourceConfig.name
    this.sourceConfig = sourceConfig
    this.pageBatch = sourceConfig.pageBatch
    this.reporter = new StatsReporter(sourceConfig.name)
  }

  /**
   * Tope global de conexiones compartido entre fuentes (trial: 10). Cuando está
   * presente, `maxWorker` deja de ser un tope de conexiones (el presupuesto lo
   * es) y pasa a ser cuántas tareas puede tener en vuelo esta fuente.
   */
  private budget?: { acquire: () => Promise<void>; release: () => void }

  useBudget(budget: { acquire: () => Promise<void>; release: () => void }) {
    this.budget = budget
    return this
  }

  private async getRepository() {
    if (!this.cachedRepository) {
      const mod = await import(`../repositories/${this.sourceConfig?.name}.js`)
      const repoName = `${this.sourceConfig?.name}Repository`
      this.cachedRepository = mod[repoName]
      if (!this.cachedRepository)
        throw new Error(`Repository not found: ${repoName}`)
    }
    return this.cachedRepository
  }

  private async getModules() {
    if (!this.cachedModules) {
      this.cachedModules = {
        services: await import(`../services/${this.sourceConfig?.name}.js`),
        processors: await import(`../processors/${this.sourceConfig?.name}.js`),
      }
    }
    return this.cachedModules
  }

  async getTasks() {
    const batchSize = this.sourceConfig?.taskBatchSize || 2000
    // Claim atómico: la tarea queda `in_progress` con lease desde aquí, así que
    // un crash no pierde el lote (el reaper lo devuelve a `pending`).
    this.taskQueue = await taskRepository.claimTasks(
      batchSize,
      this.sourceConfig?.name
    )
  }

  /**
   * Cadencia de refresh del taskType: `ingest.task_policy` manda, y si no hay
   * política se usa el default del source (Memoria del plan de fill/refresh).
   */
  private async refreshSeconds(taskType: string): Promise<number | undefined> {
    if (this.refreshCache.has(taskType)) return this.refreshCache.get(taskType)

    const source = this.sourceConfig?.name ?? this.source
    const seconds =
      (await taskRepository.refreshSecondsFor(source, taskType)) ??
      DEFAULT_REFRESH_SECONDS[taskType]

    this.refreshCache.set(taskType, seconds)
    return seconds
  }

  /** Fetch + mapeo en el proceso padre, con la IP que decidió el orquestador. */
  private async runTask(task: ScrapingTask, proxyUrl: string | undefined) {
    const modules = await this.getModules()
    const taskConfig = this.sourceConfig?.tasks[task.taskType]
    if (!taskConfig) throw new Error(`Unknown taskType: ${task.taskType}`)

    const entity = capitalize(taskConfig.entity)
    const fetchFn = modules.services[`fetch${entity}`]
    if (typeof fetchFn !== 'function') {
      throw new Error(`Missing fetch${entity} in services/${this.source}.js`)
    }

    const processFn = modules.processors[`process${entity}`]
    if (typeof processFn !== 'function') {
      throw new Error(
        `Missing process${entity} in processors/${this.source}.js`
      )
    }

    const rawData = await fetchFn(task, proxyUrl)
    return await processFn(rawData, task)
  }

  async init() {
    this.reporter.reset()
    await this.getRepository()
    await this.getModules()

    const source = this.sourceConfig?.name ?? this.source
    const hostLimits = SOURCE_HOSTS[source] ?? {
      host: source,
      limits: this.sourceConfig?.rateLimit ?? { perSecond: 1, perMinute: 60 },
    }

    const resetCount = await taskRepository.resetStaleTasks(source)
    if (resetCount > 0) console.log(`♻️  Reset ${resetCount} stale tasks`)

    // Lo vencido por política vuelve a `pending`: sin esta llamada el refresh
    // no existiría (las tareas `completed` nunca se re-armarían). Es un UPDATE
    // barato y solo toca lo que ya venció.
    const dueCount = await taskRepository.rearmDueTasks(source)
    if (dueCount > 0)
      console.log(`🔄 ${dueCount} tareas vencidas re-armadas por política`)

    // Lo que quedó `skipped` por dependencia vuelve a intentarse: la dependencia
    // pudo aterrizar en la corrida anterior.
    const rearmed = await taskRepository.rearmSkippedTasks(source)
    if (rearmed > 0) console.log(`⏸️→▶ ${rearmed} tareas skipped re-armadas`)

    proxyManager.init()
    const singleIp = SINGLE_IP_SOURCES.has(source)
    const poolSize = proxyManager.getAvailableProxies().length
    const maxInFlight = singleIp
      ? 1
      : Math.min(this.maxWorkers, Math.max(1, poolSize))

    console.log(
      `\n🚀 Starting ${source} — ${maxInFlight} tareas en vuelo · ` +
        (singleIp
          ? 'sin proxy (cuota por API key)\n'
          : `${poolSize} proxies en el pool\n`)
    )

    const dispatcher = new TaskDispatcher({
      maxInFlight,
      gate: rateGate,
      acquireProxy: () => (singleIp ? undefined : proxyManager.acquire()),
      limitsFor: () => hostLimits,
      // Fuentes con cuota por API key (TVDB): una sola clave global, aunque el
      // fetch salga por una IP distinta.
      gateKeyFor: (host, proxyUrl) =>
        proxyKey(host, KEY_SCOPED_HOSTS.has(host) ? undefined : proxyUrl),
      budget: this.budget,
      reportProxy: (proxyUrl, error) => {
        if (!proxyUrl) return
        if (error) proxyManager.reportFailure(proxyUrl)
        else proxyManager.reportSuccess(proxyUrl)
      },
    })

    this.statsInterval = setInterval(() => this.reporter.print(), 30_000)

    try {
      let batchNumber = 0
      while (true) {
        await this.getTasks()
        if (this.taskQueue.length === 0) {
          if (batchNumber === 0) console.log(`✅ No tasks for ${source}\n`)
          break
        }
        batchNumber++
        console.log(
          `\n📦 Batch ${batchNumber}: ${this.taskQueue.length} tasks\n`
        )

        const summary = await dispatcher.drain(
          this.taskQueue as DispatcherTask[],
          {
            run: async (task, proxyUrl) => {
              // Ya está claimada con lease: se ejecuta y nada más.
              return await this.runTask(task as ScrapingTask, proxyUrl)
            },
            onDone: (task, data) =>
              this.processWorkerData(task.id, task.taskType, data),
            onError: async (task, error) => {
              // Dependencia pendiente: se marca `skipped` (re-armable), no como
              // fallo. Consumir reintentos aquí acabaría en dead_letter.
              if (error instanceof SkippedTaskError) {
                await taskRepository.skipTasks([task.id], error.reason)
                return
              }
              await taskRepository.failTasks(
                [task.id],
                sanitizeError((error as Error)?.message),
                error instanceof FetchError ? error.retryAfterMs : undefined,
                error instanceof FetchError ? error.retryable : true
              )
            },
          }
        )

        console.log(
          `📦 Batch ${batchNumber}: ${summary.processed} ok · ${summary.failed} fallos ${JSON.stringify(summary.byKind)} · ${summary.proxiesUsed} IPs usadas`
        )
      }

      await this.flush()
    } finally {
      if (this.statsInterval) clearInterval(this.statsInterval)
      this.reporter.print()
      const health = proxyManager.getHealthSummary()
      console.log(
        `📡 Proxies — healthy: ${health.healthy}, cooldown: ${health.cooldown}, dead: ${health.dead}/${health.total}`
      )
    }
  }

  // --- Buffering & Saving ---

  async processWorkerData(taskId: number, taskType: string, data: any) {
    // Un processor sin resultados no es un fallo: la tarea se completa con 0
    // items y se programa su refresh por política.
    if (!data) {
      await taskRepository.completeTasks(
        [taskId],
        await this.refreshSeconds(taskType)
      )
      return
    }
    if (!this.bufferByTaskType.has(taskType))
      this.bufferByTaskType.set(taskType, [])
    this.bufferByTaskType.get(taskType)!.push({ taskId, taskType, data })
    await this.saveIfNeeded(taskType)
  }

  private async saveIfNeeded(taskType: string) {
    if (this.savingByTaskType.has(taskType)) return
    const buffer = this.bufferByTaskType.get(taskType)
    if (!buffer || buffer.length < this.pageBatch) return

    this.savingByTaskType.add(taskType)
    try {
      // `saveData` no propaga fallos de escritura (marca las tareas `failed`).
      // Sin catch a propósito: tragarse el error sería perder el lote.
      await this.saveData(buffer.splice(0, this.pageBatch))
    } finally {
      this.savingByTaskType.delete(taskType)
    }
  }

  async flush() {
    while (this.savingByTaskType.size > 0)
      await new Promise((r) => setTimeout(r, 10))

    for (const [taskType, buffer] of this.bufferByTaskType.entries()) {
      this.savingByTaskType.add(taskType)
      try {
        while (buffer.length > 0)
          await this.saveData(buffer.splice(0, this.pageBatch))
      } catch (error) {
        // Un tipo que falle no puede abortar el volcado de los demás.
        console.error(`Error flushing ${taskType}:`, error)
      } finally {
        this.savingByTaskType.delete(taskType)
      }
    }
  }

  async saveData(batch: BufferedTask[]) {
    if (batch.length === 0) return
    const first = batch[0]
    if (!first) return
    const taskConfig = this.sourceConfig?.tasks[first.taskType]
    const entity = capitalize(taskConfig?.entity || '')
    const saveFnName = `save${entity}`

    const items = batch.flatMap((b) =>
      Array.isArray(b.data) ? b.data : [b.data]
    )
    const taskIds = batch.map((b) => b.taskId)

    try {
      const repository = await this.getRepository()
      const totalSaved = (await repository[saveFnName](items)) ?? items.length

      // Si el filtro de FK dejó filas fuera (padre inexistente), el lote queda
      // `skipped`: se escribió lo válido y se reintenta cuando el padre exista.
      const deferred = takeDeferredDependencies()
      if (deferred > 0) {
        await taskRepository.skipTasks(
          taskIds,
          `missing:dependency (${deferred} filas diferidas)`
        )
        this.reporter.recordSaved(entity, totalSaved, 0)
        console.log(
          `⏸️  ${entity}: ${totalSaved} guardados, ${deferred} diferidos por dependencia (tareas re-armables)`
        )
        return
      }

      await taskRepository.completeTasks(
        taskIds,
        await this.refreshSeconds(first.taskType)
      )
      this.reporter.recordSaved(entity, totalSaved, batch.length)
      console.log(
        `💾 Saved ${totalSaved} ${entity}(s) from ${batch.length} task(s)`
      )
    } catch (error: any) {
      // Una escritura fallida NO puede marcar la tarea como completada: eso
      // sería pérdida silenciosa de datos.
      const reason = sanitizeError(error?.message)
      this.reporter.incrementErrors(batch.length)
      console.error(`❌ Failed to save ${batch.length} ${entity}(s): ${reason}`)
      try {
        await taskRepository.failTasks(taskIds, reason)
      } catch (markError) {
        // Si ni marcar el fallo se puede (DB caída), es preferible dejar las
        // tareas `in_progress`: el próximo arranque las re-encola. Propagar
        // aquí colgaría la corrida.
        console.error(
          `Could not mark ${taskIds.length} task(s) as failed:`,
          markError
        )
      }
    }
  }

  printStats() {
    this.reporter.print()
  }
}
