import { Worker } from 'node:worker_threads'
import { proxyManager } from './proxyManager.js'
import type { Proxy, ScrapingTask, SourceConfig, BufferedTask } from '../types/index.js'

export class BaseWorkerManager {
  maxWorkers: number
  source: string
  workerPath: string
  workers: Worker[]
  taskQueue: any[]
  completionPromise: Promise<void> | null
  resolveCompletion: (() => void) | null
  pageBatch = 0
  bufferByTaskType: Map<string, BufferedTask[]> = new Map()

  saving = false
  finishedWorkers = 0
  sourceConfig: SourceConfig | null = null

  stats: {
    startTime: number | null
    tasksCompleted: number
    tasksErrors: number
    itemsSaved?: Record<string, number>
  }
  constructor({
    maxWorkers = 10,
    source,
    workerPath,
  }: {
    maxWorkers?: number
    source: string
    workerPath: string
  }) {
    this.maxWorkers = maxWorkers
    this.source = source
    this.workerPath = workerPath

    this.workers = []
    this.taskQueue = []

    this.stats = this.createInitialStats()

    // Promesa que se resuelve cuando todos los workers terminan
    this.completionPromise = null
    this.resolveCompletion = null
  }

  /* =========================
     STATS
     ========================= */
  createInitialStats() {
    return {
      startTime: null,
      tasksCompleted: 0,
      tasksErrors: 0,
    }
  }

  resetStats() {
    this.stats = {
      ...this.createInitialStats(),
      startTime: Date.now(),
    }
  }

  /* =========================
     TASKS (override if needed)
     ========================= */
  async getTasks() {
    throw new Error('getTasks() must be implemented')
  }

  /* =========================
     WORKERS CORE
     ========================= */
  spawnWorker(id: number, tasks: ScrapingTask[], proxy: Proxy) {
    const workerData = this.getWorkerData
      ? this.getWorkerData(id, tasks, proxy)
      : { workerId: id, tasks, proxy }

    const worker = new Worker(this.workerPath, {
      workerData,
    })

    worker.on('message', (msg) => this.handleWorkerMessage(id, msg))
    worker.on('error', (err) => this.handleWorkerError(id, err))

    this.workers.push(worker)
  }
  getWorkerData(id: number, tasks: ScrapingTask[], proxy: Proxy) {
    return {
      workerId: id,
      tasks,
      proxy,
    }
  }

  async handleWorkerMessage(id: number, msg: any): Promise<void> {
    throw new Error('handleWorkerMessage() must be implemented')
  }

  async handleWorkerError(id: number, err: any): Promise<void> {
    this.stats.tasksErrors++
    console.error(`Worker ${id} error:`, err)
  }

  distributeTasks() {
    const totalTasks = this.taskQueue.length
    if (!totalTasks) return

    const workersToUse = Math.min(this.maxWorkers, totalTasks)
    const tasksPerWorker = Math.ceil(totalTasks / workersToUse)

    proxyManager.init()
    const proxies = proxyManager.getProxyList(workersToUse)

    for (let i = 0; i < workersToUse; i++) {
      const start = i * tasksPerWorker
      const end = start + tasksPerWorker
      const chunk = this.taskQueue.slice(start, end)

      if (chunk.length) {
        const proxy = proxies[i]

        if (!proxy) {
          console.error(
            `No proxy available for worker ${i}, skipping worker spawn.`
          )
          continue
        }

        this.spawnWorker(i, chunk, proxy)
      }
    }
  }
  printStats() {
    const endTime = Date.now()
    const duration = this.stats.startTime
      ? (endTime - this.stats.startTime) / 1000
      : 0
    console.log(`\n✅ All tasks completed for ${this.source}`)
    console.log(`   Tasks completed: ${this.stats.tasksCompleted}`)
    console.log(`   Tasks errors: ${this.stats.tasksErrors}`)
    console.log(`   Duration: ${duration.toFixed(2)} seconds\n`)
  }

  /* =========================
     LIFECYCLE
     ========================= */
  async init() {
    this.resetStats()
    await this.getTasks()

    console.log(
      `\n🚀 Starting ${this.source} with ${this.taskQueue.length} tasks...\n`
    )

    // Si no hay tareas, resolver inmediatamente
    if (this.taskQueue.length === 0) {
      console.log(`✅ No tasks to process for ${this.source}\n`)
      return
    }

    // Crear promesa de completación
    this.completionPromise = new Promise((resolve) => {
      this.resolveCompletion = resolve
    })

    this.distributeTasks()

    // Esperar a que todos los workers terminen
    await this.completionPromise

    this.printStats()
  }
}
