import { BaseWorkerManager } from './baseManager.js'
import { taskRepository } from '../repositories/tasks.js'
import type {
    ProxyState,
  ScrapingTask,
  SourceConfig,
  WorkerMessage,
} from '../types/index.js'
import { capitalize } from '../config/sources.js'
import { proxyManager } from './proxyManager.js'

export class GenericManager extends BaseWorkerManager {
  savingByTaskType: Set<string> = new Set()
  private cachedRepository: any = null
  private statsInterval: ReturnType<typeof setInterval> | null = null
  private workersSpawned = false

  constructor(sourceConfig: SourceConfig) {
    super({
      maxWorkers: sourceConfig.maxWorkers,
      source: sourceConfig.name,
      workerPath: './dist/src/core/genericWorker.js',
    })

    this.sourceConfig = sourceConfig
    this.pageBatch = sourceConfig.pageBatch
    this.bufferByTaskType = new Map()
    this.finishedWorkers = 0

    this.stats = {
      startTime: Date.now(),
      tasksCompleted: 0,
      tasksProcessed: 0,
      tasksErrors: 0,
      itemsSaved: {},
    }
  }

  override createInitialStats() {
    return {
      startTime: null,
      tasksCompleted: 0,
      tasksProcessed: 0,
      tasksErrors: 0,
      itemsSaved: {},
    }
  }

  /* =========================
     REPOSITORY CACHE
     ========================= */
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

  /* =========================
     TASKS — batched loading
     ========================= */
  override async getTasks() {
    const batchSize = this.sourceConfig?.taskBatchSize || 2000
    this.taskQueue = await taskRepository.getPendingTasks(
      batchSize,
      this.sourceConfig?.name
    )
  }

  override getWorkerData(id: number, tasks: ScrapingTask[], proxy: ProxyState) {
    console.log(
      `Spawning worker ${id} with ${tasks.length} tasks and proxy ${proxy.url}`
    )

    return {
      workerId: id,
      tasks,
      proxy,
      sourceName: this.sourceConfig?.name,
      sourceConfig: this.sourceConfig,
    }
  }

  /* =========================
     PERSISTENT WORKER MANAGEMENT
     Reuse workers across batches — send new tasks via postMessage
     ========================= */
  private sendTasksToWorkers() {
    const totalTasks = this.taskQueue.length
    if (!totalTasks || this.workers.length === 0) return

    const tasksPerWorker = Math.ceil(totalTasks / this.workers.length)

    for (let i = 0; i < this.workers.length; i++) {
      const start = i * tasksPerWorker
      const end = start + tasksPerWorker
      const taskSlice = this.taskQueue.slice(start, end)

      if (taskSlice.length > 0) {
        this.workers[i]!.postMessage({
          type: 'newTasks',
          tasks: taskSlice,
        })
      }
    }

    console.log(
      `📨 Sent ${totalTasks} tasks to ${this.workers.length} existing workers`
    )
  }

  private shutdownWorkers() {
    for (const worker of this.workers) {
      worker.postMessage({ type: 'shutdown' })
    }
    this.workers = []
    this.workersSpawned = false
  }

  /* =========================
     BATCHED INIT — loads tasks in batches,
     processes each batch fully before loading next.
     Workers are kept alive across batches.
     ========================= */
  override async init() {
    this.resetStats()
    await this.getRepository() // warm cache

    // Reset orphaned in_progress tasks from previous crashed runs
    const resetCount = await taskRepository.resetStaleTasks(
      this.sourceConfig?.name
    )
    if (resetCount > 0) {
      console.log(
        `♻️  Reset ${resetCount} stale in_progress tasks back to pending`
      )
    }

    console.log(`\n🚀 Starting ${this.sourceConfig?.name}...\n`)

    // Periodic stats every 30s
    this.statsInterval = setInterval(() => this.printStats(), 30_000)

    try {
      let batchNumber = 0

      while (true) {
        await this.getTasks()

        if (this.taskQueue.length === 0) {
          if (batchNumber === 0) {
            console.log(`✅ No tasks to process for ${this.source}\n`)
          }
          break
        }

        batchNumber++
        console.log(
          `\n📦 Batch ${batchNumber}: ${this.taskQueue.length} tasks\n`
        )

        // Batch mark all tasks as in_progress (1 query instead of N)
        const taskIds = this.taskQueue.map((t) => t.id)
        await taskRepository.markTasksInProgress(taskIds)

        // Reset per-batch state
        this.finishedWorkers = 0
        this.bufferByTaskType = new Map()

        // Create completion promise
        this.completionPromise = new Promise((resolve) => {
          this.resolveCompletion = resolve
        })

        if (!this.workersSpawned) {
          // First batch: spawn workers with initial tasks
          this.distributeTasks()
          this.workersSpawned = true
        } else {
          // Subsequent batches: reuse existing workers
          this.sendTasksToWorkers()
        }

        await this.completionPromise
      }
    } finally {
      this.shutdownWorkers()
      if (this.statsInterval) clearInterval(this.statsInterval)
      this.printStats()

      // Log proxy health summary
      const health = proxyManager.getHealthSummary()
      console.log(
        `📡 Proxies — healthy: ${health.healthy}, cooldown: ${health.cooldown}, dead: ${health.dead}/${health.total}`
      )
    }
  }

  /* =========================
     WORKER MESSAGES
     Handles done, error, finished, proxy-failure, proxy-success
     ========================= */
  override async handleWorkerMessage(
    id: number,
    msg: WorkerMessage
  ): Promise<void> {
    const { status, taskId, taskType, data, error, proxyUrl } = msg

    if (status === 'proxy-failure' && proxyUrl) {
      proxyManager.reportFailure(proxyUrl)
      return
    }

    if (status === 'proxy-success' && proxyUrl) {
      proxyManager.reportSuccess(proxyUrl)
      return
    }

    if (status === 'done') {
      this.stats.tasksProcessed = (this.stats.tasksProcessed ?? 0) + 1
      await this.processWorkerData(taskId, taskType, data)
    }

    if (status === 'error') {
      this.stats.tasksErrors++
      console.error(`Worker ${id} error on task ${taskId}:`, error)
      await taskRepository.markTaskFailed(taskId, error || 'Unknown error')
    }

    if (status === 'finished') {
      this.finishedWorkers++
      console.log(
        `Worker ${id} finished (${this.finishedWorkers}/${this.workers.length})`
      )

      if (this.finishedWorkers === this.workers.length) {
        await this.flush()
        if (this.resolveCompletion) this.resolveCompletion()
      }
    }
  }

  /* =========================
     BUFFERING + SAVING
     ========================= */
  async processWorkerData(taskId: number, taskType: string, data: any) {
    if (!data) return

    const entry = { taskId, taskType, data }

    if (!this.bufferByTaskType.has(taskType)) {
      this.bufferByTaskType.set(taskType, [])
    }

    this.bufferByTaskType.get(taskType)!.push(entry)

    await this.saveIfNeeded(taskType)
  }

  async saveIfNeeded(taskType: string) {
    if (this.savingByTaskType.has(taskType)) return

    const buffer = this.bufferByTaskType.get(taskType)
    if (!buffer || buffer.length < this.pageBatch) return

    this.savingByTaskType.add(taskType)

    try {
      const batch = buffer.splice(0, this.pageBatch)
      await this.saveData(batch)
    } catch (error) {
      console.error('Error saving batch:', error)
    } finally {
      this.savingByTaskType.delete(taskType)
    }
  }

  async flush() {
    // Wait for all in-progress saves to finish
    while (this.savingByTaskType.size > 0) {
      await new Promise((r) => setTimeout(r, 10))
    }

    for (const [taskType, buffer] of this.bufferByTaskType.entries()) {
      this.savingByTaskType.add(taskType)
      try {
        while (buffer.length > 0) {
          const batch = buffer.splice(0, this.pageBatch)
          await this.saveData(batch)
        }
      } finally {
        this.savingByTaskType.delete(taskType)
      }
    }
  }

  async saveData(batch: any[]) {
    if (batch.length === 0) return

    const repository = await this.getRepository()

    const taskType = batch[0].taskType
    const taskConfig = this.sourceConfig?.tasks[taskType]
    const entity = capitalize(taskConfig?.entity || '')
    const saveFnName = `save${entity}`

    const items = batch.flatMap((b) =>
      Array.isArray(b.data) ? b.data : [b.data]
    )

    const totalSaved = (await repository[saveFnName](items)) ?? items.length

    const taskIds = batch.map((b) => b.taskId)
    await taskRepository.markTasksCompleted(taskIds)

    this.stats.tasksCompleted += taskIds.length
    this.stats.itemsSaved ??= {}
    this.stats.itemsSaved[entity] =
      (this.stats.itemsSaved[entity] ?? 0) + totalSaved

    console.log(
      `💾 Saved ${totalSaved} ${entity}(s) from ${batch.length} task(s)`
    )
  }

  /* =========================
     STATS with throughput metrics
     ========================= */
  override printStats() {
    const startTime = this?.stats?.startTime ?? Date.now()
    const elapsed = Date.now() - startTime
    const min = (elapsed / 60000).toFixed(2)
    const tasksPerMin =
      elapsed > 0
        ? ((this.stats?.tasksCompleted ?? 0) / (elapsed / 60000)).toFixed(1)
        : '0'

    console.log('\n══════════════════════════════')
    console.log(`📊 ${this.sourceConfig?.name?.toUpperCase()} STATS`)
    console.log(`⏱️  ${min} min`)
    console.log(`🔄 Processed: ${this.stats?.tasksProcessed ?? 0}`)
    console.log(`✅ Saved: ${this.stats?.tasksCompleted} (${tasksPerMin}/min)`)
    console.log(`❌ Errors: ${this.stats?.tasksErrors}`)

    if (Object.keys(this.stats?.itemsSaved || {}).length > 0) {
      console.log('💾 Items Saved:')
      for (const [key, value] of Object.entries(this.stats?.itemsSaved || {})) {
        console.log(`   ${key}: ${value}`)
      }
    }

    console.log('══════════════════════════════\n')
  }
}
