import { taskRepository } from '../repositories/tasks.js'
import { StatsReporter } from './statsReporter.js'
import { proxyManager } from './proxyManager.js'
import { RateGate } from './rateGate.js'
import { proxyKey } from './rateGate.js'
import { TaskDispatcher, type DispatcherTask } from './taskDispatcher.js'
import { SINGLE_IP_SOURCES, SOURCE_HOSTS } from '../config/sources.js'
import { KEY_SCOPED_HOSTS } from '../config/sources.js'
import type { RefreshPolicy } from '../config/sources.js'
import { capitalize } from '../shared/parsers.js'
import { animeIdForTask } from '../shared/refreshTarget.js'
import { sanitizeError } from '../utils/sanitizeError.js'
import { FetchError } from '../libs/httpError.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import { takeDeferredDependencies } from '../shared/dependencyTracker.js'
import type {
  ScrapingTask,
  SourceConfig,
  BufferedTask,
} from '../types/index.js'

/** Presupuesto de una corrida incremental (Modo B). */
export interface IncrementalOptions {
  /** Máximo de tareas a procesar (claim + drain) en esta corrida. */
  maxTasks?: number
  /** Epoch ms en que la corrida debe cortar (deja lo pendiente para la próxima). */
  deadline?: number
  /** Tope de tareas en vuelo (prod: una IP, no hace falta fan-out). */
  maxInFlight?: number
}

/** Resumen agregado de la corrida (alimenta `ingest.run`). */
export interface RunSummary {
  processed: number
  failed: number
  retried: number
  deadLettered: number
  blocked: number
  byKind: Record<string, number>
}

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
  private readonly refreshCache = new Map<string, RefreshPolicy>()
  private readonly incremental: IncrementalOptions = {}
  private hotCache?: { ids: Set<number>; at: number }
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

  private proxyShard?: { index: number; count: number }

  useBudget(budget: { acquire: () => Promise<void>; release: () => void }) {
    this.budget = budget
    return this
  }

  /**
   * Modo B: la corrida no drena la cola entera. Sin presupuesto, el manager se
   * comporta como el backfill (hasta vaciar), que es lo que quieren los scripts
   * de una sola pasada.
   */
  useIncremental(options: IncrementalOptions) {
    Object.assign(this.incremental, options)
    return this
  }

  /**
   * Asigna a esta fuente un **shard** del pool de proxies (su propia porción de
   * IPs), para que las fuentes que corren en paralelo no compitan por las mismas
   * y no se disparen los 429 por IP.
   */
  useProxyShard(index: number, count: number) {
    this.proxyShard = { index, count }
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

  async getTasks(limit?: number) {
    const configured = this.sourceConfig?.taskBatchSize || 2000
    const batchSize =
      limit === undefined
        ? configured
        : Math.min(configured, Math.max(0, limit))
    if (batchSize <= 0) {
      this.taskQueue = []
      return
    }
    // Claim atómico: la tarea queda `in_progress` con lease desde aquí, así que
    // un crash no pierde el lote (el reaper lo devuelve a `pending`).
    this.taskQueue = await taskRepository.claimTasks(
      batchSize,
      this.sourceConfig?.name
    )
  }

  /** Política de refresh del taskType (DB manda; código de fallback). */
  private async refreshPolicy(taskType: string): Promise<RefreshPolicy> {
    if (this.refreshCache.has(taskType)) return this.refreshCache.get(taskType)!

    const source = this.sourceConfig?.name ?? this.source
    const policy = await taskRepository.refreshPolicyFor(source, taskType)
    this.refreshCache.set(taskType, policy)
    return policy
  }

  /** Set de anime "hot", cacheado 10 min por corrida. */
  private async hotAnimeIds(): Promise<Set<number>> {
    const now = Date.now()
    if (!this.hotCache || now - this.hotCache.at > 10 * 60_000) {
      this.hotCache = { ids: await taskRepository.hotAnimeIds(), at: now }
    }
    return this.hotCache.ids
  }

  /**
   * Intervalo de refresh de **esta** tarea: airing si su anime está en
   * emisión (o recién terminado), cold en el resto. `null` = nunca.
   */
  async refreshSecondsForTask(task: ScrapingTask): Promise<number | null> {
    const policy = await this.refreshPolicy(task.taskType)
    if (policy.hot === null) return policy.cold

    const animeId = animeIdForTask(task)
    if (!animeId) return policy.cold

    const hot = await this.hotAnimeIds()
    return hot.has(animeId) ? policy.hot : policy.cold
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

  async init(): Promise<RunSummary> {
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

    // Lo que quedó `skipped` por dependencia vuelve a intentarse (con backoff):
    // la dependencia pudo aterrizar en una corrida anterior.
    const rearmed = await taskRepository.rearmSkippedTasks(source)
    if (rearmed > 0) console.log(`⏸️→▶ ${rearmed} tareas skipped re-armadas`)

    proxyManager.init()
    const singleIp = SINGLE_IP_SOURCES.has(source)
    const poolSize = proxyManager.getAvailableProxies().length
    // Fuentes sin proxy (cuota por key/client id): pueden tener varias en vuelo
    // sin tocar el tope de conexiones del proveedor; el gate por host las acota.
    // En vuelo = `maxWorkers` (no el tamaño del pool): varias tareas pueden
    // compartir IP, y el `RateGate` es quien limita por (host, IP). Limitarlo
    // al tamaño del pool dejaba el 50 % de los workers ociosos.
    const maxInFlight = Math.max(
      1,
      Math.min(this.maxWorkers, this.incremental.maxInFlight ?? this.maxWorkers)
    )

    console.log(
      `\n🚀 Starting ${source} — ${maxInFlight} tareas en vuelo · ` +
        (singleIp
          ? 'directo (cuota por API key)\n'
          : `${poolSize} proxies en el pool\n`)
    )

    const dispatcher = new TaskDispatcher({
      maxInFlight,
      deadline: this.incremental.deadline,
      gate: rateGate,
      // Una fuente caída no quema el presupuesto de las demás.
      maxConsecutiveFailures: 10,
      acquireProxy: () =>
        singleIp
          ? undefined
          : this.proxyShard
            ? proxyManager.acquireShard(
                this.proxyShard.index,
                this.proxyShard.count
              )
            : proxyManager.acquire(),
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

    const runSummary: RunSummary = {
      processed: 0,
      failed: 0,
      retried: 0,
      deadLettered: 0,
      blocked: 0,
      byKind: {},
    }

    try {
      let batchNumber = 0
      while (true) {
        const remaining =
          this.incremental.maxTasks === undefined
            ? undefined
            : this.incremental.maxTasks - runSummary.processed
        if (remaining !== undefined && remaining <= 0) {
          console.log(
            `⏱️  Presupuesto agotado (${this.incremental.maxTasks} tareas)`
          )
          break
        }
        if (
          this.incremental.deadline &&
          Date.now() >= this.incremental.deadline
        ) {
          console.log('⏱️  Deadline de la corrida alcanzado')
          break
        }

        await this.getTasks(remaining)
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
              this.processWorkerData(task as ScrapingTask, data),
            onError: async (task, error) => {
              // Dependencia pendiente: se marca `skipped` (re-armable), no como
              // fallo. Consumir reintentos aquí acabaría en dead_letter.
              if (error instanceof SkippedTaskError) {
                await taskRepository.skipTasks([task.id], error.reason)
                return
              }
              const result = await taskRepository.failTasks(
                [task.id],
                sanitizeError((error as Error)?.message),
                error instanceof FetchError ? error.retryAfterMs : undefined,
                error instanceof FetchError ? error.retryable : true
              )
              // El dispatcher cuenta el fallo igual; aquí se distingue si
              // volvió a `pending` (reintento) o cayó a `dead_letter`.
              runSummary.retried += result.retried
              runSummary.deadLettered += result.deadLettered
            },
          }
        )

        runSummary.processed += summary.processed
        runSummary.failed += summary.failed
        for (const [kind, count] of Object.entries(summary.byKind)) {
          runSummary.byKind[kind] = (runSummary.byKind[kind] ?? 0) + count
          if (kind === 'rate_limit' || kind === 'blocked') {
            runSummary.blocked += count
          }
        }

        // El deadline corta el lote: lo claimado y no ejecutado vuelve a
        // `pending` (sin consumir intento) en vez de quedar con lease vivo.
        if (summary.unprocessedIds.length > 0) {
          const released = await taskRepository.releaseTasks(
            summary.unprocessedIds
          )
          console.log(`↩️  ${released} tareas devueltas a pending (deadline)`)
        }

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

    return runSummary
  }

  // --- Buffering & Saving ---

  async processWorkerData(task: ScrapingTask, data: any) {
    const refreshSeconds = await this.refreshSecondsForTask(task)
    // Un processor sin resultados no es un fallo: la tarea se completa con 0
    // items y se programa su refresh por política (airing vs. nunca).
    if (!data) {
      await taskRepository.completeTasksWithRefresh([
        { id: task.id, refreshSeconds },
      ])
      return
    }
    if (!this.bufferByTaskType.has(task.taskType))
      this.bufferByTaskType.set(task.taskType, [])
    this.bufferByTaskType
      .get(task.taskType)!
      .push({ taskId: task.id, taskType: task.taskType, data, refreshSeconds })
    await this.saveIfNeeded(task.taskType)
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

      // Si el filtro de FK dejó filas fuera (padre inexistente), la tarea queda
      // `skipped` para reintentarla cuando el padre exista.
      //
      // El contador es del proceso, no de la tarea: como un lote lleva hasta
      // `pageBatch` tareas, marcar todo el lote acusaba de "diferido" a tareas
      // que guardaron bien (se veía con animeThemes: 1.500 tareas `skipped` con
      // su música ya escrita). Por eso, cuando hay diferidos, se re-guarda
      // **tarea por tarea** (idempotente: los repos hacen upsert) para saber
      // cuáles fallaron de verdad; el costo extra solo aparece en ese caso.
      const deferred = takeDeferredDependencies()
      if (deferred > 0) {
        const skipped: number[] = []
        const completed: { id: number; refreshSeconds: number | null }[] = []
        for (const buffered of batch) {
          const taskItems = Array.isArray(buffered.data)
            ? buffered.data
            : [buffered.data]
          await repository[saveFnName](taskItems)
          if (takeDeferredDependencies() > 0) skipped.push(buffered.taskId)
          else
            completed.push({
              id: buffered.taskId,
              refreshSeconds: buffered.refreshSeconds ?? null,
            })
        }

        if (completed.length > 0) {
          await taskRepository.completeTasksWithRefresh(completed)
        }
        if (skipped.length > 0) {
          await taskRepository.skipTasks(skipped, 'missing:dependency')
        }
        this.reporter.recordSaved(entity, totalSaved, completed.length)
        console.log(
          `⏸️  ${entity}: ${totalSaved} guardados · ${skipped.length} tareas diferidas por dependencia (re-armables)`
        )
        return
      }

      await taskRepository.completeTasksWithRefresh(
        batch.map((b) => ({
          id: b.taskId,
          refreshSeconds: b.refreshSeconds ?? null,
        }))
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
