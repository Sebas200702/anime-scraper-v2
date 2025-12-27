import { BaseWorkerManager } from './baseManager.js'
import { taskRepository } from '../repositories/tasks.js'
import type {
  ScrapingTask,
  SourceConfig,
  Proxy,
  WorkerMessage,
} from '../types/index.js'
import { capitalize } from '../config/sources.js'

export class GenericManager extends BaseWorkerManager {
  constructor(sourceConfig: SourceConfig) {
    super({
      maxWorkers: sourceConfig.maxWorkers,
      source: sourceConfig.name,
      workerPath: './dist/src/core/genericWorker.js',
    })

    this.sourceConfig = sourceConfig
    this.pageBatch = sourceConfig.pageBatch
    this.bufferByTaskType = new Map()
    this.saving = false
    this.finishedWorkers = 0

    this.stats = {
      startTime: Date.now(),
      tasksCompleted: 0,
      tasksErrors: 0,
      itemsSaved: {},
    }
  }

  override createInitialStats() {
    return {
      startTime: null,
      tasksCompleted: 0,
      tasksErrors: 0,
      itemsSaved: {},
    }
  }

  override async getTasks() {
    this.taskQueue = await taskRepository.getPendingTasks(
      null,
      this.sourceConfig?.name
    )
  }

  override getWorkerData(id: number, tasks: ScrapingTask[], proxy: Proxy) {
    console.log(
      `Spawning worker ${id} with ${tasks.length} tasks and proxy ${proxy.value}`
    )

    return {
      workerId: id,
      tasks,
      proxy,
      sourceName: this.sourceConfig?.name,
      sourceConfig: this.sourceConfig,
    }
  }

  override async handleWorkerMessage(
    id: number,
    msg: WorkerMessage
  ): Promise<void> {
    const { status, taskId, taskType, data, error } = msg

    if (status === 'done') {
      await this.processWorkerData(taskId, taskType, data)
    }

    if (status === 'error') {
      this.stats.tasksErrors++
      console.error(`Worker ${id} error on task ${taskId}:`, error)
    }

    if (status === 'finished') {
      this.finishedWorkers++
      console.log(
        `Worker ${id} finished (${this.finishedWorkers}/${this.workers.length})`
      )

      if (this.finishedWorkers === this.workers.length) {
        await this.flush()
        this.printStats()
        if (this.resolveCompletion) this.resolveCompletion()
      }
    }
  }

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
    if (this.saving) return

    const buffer = this.bufferByTaskType.get(taskType)
    if (!buffer || buffer.length < this.pageBatch) return

    this.saving = true

    try {
      const batch = buffer.splice(0, this.pageBatch)
      await this.saveData(batch)
    } catch (error) {
      console.error('Error saving batch:', error)
    } finally {
      this.saving = false
    }
  }

  async flush() {
    while (this.saving) {
      await new Promise((r) => setTimeout(r, 10))
    }

    this.saving = true

    try {
      for (const [, buffer] of this.bufferByTaskType.entries()) {
        while (buffer.length > 0) {
          const batch = buffer.splice(0, this.pageBatch)
          await this.saveData(batch)
        }
      }
    } finally {
      this.saving = false
    }
  }

  async saveData(batch: any[]) {
    if (batch.length === 0) return

    const repoModule = await import(
      `../repositories/${this.sourceConfig?.name}.js`
    )

    const repoName = `${this.sourceConfig?.name}Repository`
    const repository = repoModule[repoName]

    if (!repository) {
      throw new Error(`Repository not found: ${repoName}`)
    }

    const taskType = batch[0].taskType
    const taskConfig = this.sourceConfig?.tasks[taskType]
    const entity = capitalize(taskConfig?.entity || '')
    const saveFnName = `save${entity}`

    const items = batch.flatMap((b) =>
      Array.isArray(b.data) ? b.data : [b.data]
    )

    const totalSaved = await repository[saveFnName](items)

    const taskIds = batch.map((b) => b.taskId)
    await taskRepository.markTasksCompleted(taskIds)

    this.stats.tasksCompleted += taskIds.length
    this.stats.itemsSaved ??= {}
    this.stats.itemsSaved[entity] =
      (this.stats.itemsSaved[entity] ?? 0) + totalSaved

    console.log(`Saved ${totalSaved} ${entity}(s) from ${batch.length} task(s)`)
  }

  override printStats() {
    const startTime = this?.stats?.startTime ?? Date.now()
    const min = ((Date.now() - startTime) / 60000).toFixed(2)

    console.log('\n══════════════════════════════')
    console.log(`${this.sourceConfig?.name.toUpperCase()} STATS`)
    console.log(`⏱️  ${min} min`)
    console.log(`✅ Tasks: ${this.stats?.tasksCompleted}`)
    console.log(`❌ Errors: ${this.stats?.tasksErrors}`)
    console.log('\n💾 Items Saved:')

    for (const [key, value] of Object.entries(this.stats?.itemsSaved || {})) {
      console.log(`   ${key}: ${value}`)
    }

    console.log('══════════════════════════════\n')
  }
}
