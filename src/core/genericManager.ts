import { BaseWorkerManager } from './baseManager.js'
import { taskRepository } from '../repositories/tasks.js'
import { StatsReporter } from './statsReporter.js'
import { proxyManager } from './proxyManager.js'
import { capitalize } from '../shared/parsers.js'
import type {
  ProxyState,
  ScrapingTask,
  SourceConfig,
  WorkerMessage,
  BufferedTask,
} from '../types/index.js'

export class GenericManager extends BaseWorkerManager {
  private readonly savingByTaskType: Set<string> = new Set()
  private cachedRepository: any = null
  private statsInterval: ReturnType<typeof setInterval> | null = null
  private workersSpawned = false
  private readonly reporter: StatsReporter

  constructor(sourceConfig: SourceConfig) {
    super({
      maxWorkers: sourceConfig.maxWorkers,
      source: sourceConfig.name,
      workerPath: './dist/src/core/genericWorker.js',
    })
    this.sourceConfig = sourceConfig
    this.pageBatch = sourceConfig.pageBatch
    this.reporter = new StatsReporter(sourceConfig.name)
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

  private sendTasksToWorkers() {
    const totalTasks = this.taskQueue.length
    if (!totalTasks || this.workers.length === 0) return
    const tasksPerWorker = Math.ceil(totalTasks / this.workers.length)

    for (let i = 0; i < this.workers.length; i++) {
      const slice = this.taskQueue.slice(
        i * tasksPerWorker,
        (i + 1) * tasksPerWorker
      )
      if (slice.length > 0) {
        this.workers[i]!.postMessage({ type: 'newTasks', tasks: slice })
      }
    }
    console.log(
      `📨 Sent ${totalTasks} tasks to ${this.workers.length} existing workers`
    )
  }

  private shutdownWorkers() {
    for (const worker of this.workers) worker.postMessage({ type: 'shutdown' })
    this.workers = []
    this.workersSpawned = false
  }

  override async init() {
    this.reporter.reset()
    await this.getRepository()

    const resetCount = await taskRepository.resetStaleTasks(
      this.sourceConfig?.name
    )
    if (resetCount > 0) console.log(`♻️  Reset ${resetCount} stale tasks`)

    console.log(`\n🚀 Starting ${this.sourceConfig?.name}...\n`)
    this.statsInterval = setInterval(() => this.reporter.print(), 30_000)

    try {
      let batchNumber = 0
      while (true) {
        await this.getTasks()
        if (this.taskQueue.length === 0) {
          if (batchNumber === 0) console.log(`✅ No tasks for ${this.source}\n`)
          break
        }
        batchNumber++
        console.log(
          `\n📦 Batch ${batchNumber}: ${this.taskQueue.length} tasks\n`
        )

        await taskRepository.markTasksInProgress(
          this.taskQueue.map((t) => t.id)
        )
        this.finishedWorkers = 0
        this.bufferByTaskType = new Map()
        this.completionPromise = new Promise((r) => {
          this.resolveCompletion = r
        })

        if (!this.workersSpawned) {
          this.distributeTasks()
          this.workersSpawned = true
        } else {
          this.sendTasksToWorkers()
        }
        await this.completionPromise
      }
    } finally {
      this.shutdownWorkers()
      if (this.statsInterval) clearInterval(this.statsInterval)
      this.reporter.print()
      const health = proxyManager.getHealthSummary()
      console.log(
        `📡 Proxies — healthy: ${health.healthy}, cooldown: ${health.cooldown}, dead: ${health.dead}/${health.total}`
      )
    }
  }

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
      this.reporter.incrementProcessed()
      await this.processWorkerData(taskId, taskType, data)
    }
    if (status === 'error') {
      this.reporter.incrementErrors()
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

  // --- Buffering & Saving ---

  async processWorkerData(taskId: number, taskType: string, data: any) {
    if (!data) return
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
      await this.saveData(buffer.splice(0, this.pageBatch))
    } catch (error) {
      console.error('Error saving batch:', error)
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
      } finally {
        this.savingByTaskType.delete(taskType)
      }
    }
  }

  async saveData(batch: BufferedTask[]) {
    if (batch.length === 0) return
    const first = batch[0]
    if (!first) return
    const repository = await this.getRepository()
    const taskConfig = this.sourceConfig?.tasks[first.taskType]
    const entity = capitalize(taskConfig?.entity || '')
    const saveFnName = `save${entity}`

    const items = batch.flatMap((b) =>
      Array.isArray(b.data) ? b.data : [b.data]
    )
    const totalSaved = (await repository[saveFnName](items)) ?? items.length

    await taskRepository.markTasksCompleted(batch.map((b) => b.taskId))
    this.reporter.recordSaved(entity, totalSaved, batch.length)
    console.log(
      `💾 Saved ${totalSaved} ${entity}(s) from ${batch.length} task(s)`
    )
  }

  override printStats() {
    this.reporter.print()
  }
}
