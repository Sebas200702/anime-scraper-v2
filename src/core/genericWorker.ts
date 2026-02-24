import { parentPort, workerData } from 'node:worker_threads'
import { ProxyAgent } from 'undici'
import { createRateLimiter } from '../utils/rateLimit.js'
import { capitalize } from '../shared/parsers.js'
import type { WorkerMessage } from 'types/index.js'

const { workerId, tasks, proxy, sourceName, sourceConfig } = workerData
const agent = new ProxyAgent(proxy.url)

const rateLimiter = createRateLimiter(
  sourceConfig.rateLimit.perSecond,
  sourceConfig.rateLimit.perMinute
)

async function run() {
  // Importar módulos dinámicamente una sola vez
  const libModule = await import(`../services/${sourceName}.js`)
  const processorModule = await import(`../processors/${sourceName}.js`)

  for (const task of tasks) {
    try {
      await rateLimiter()

      const taskConfig = sourceConfig.tasks[task.taskType]
      const entity = capitalize(taskConfig.entity)

      // 1. FETCH
      // Convención: fetch{Entity}(task, agent)
      const fetchFnName = `fetch${entity}`
      if (!libModule[fetchFnName])
        throw new Error(`Missing ${fetchFnName} in services/${sourceName}.js`)

      const rawData = await libModule[fetchFnName](task, agent)

      console.log(
        `Worker ${workerId} fetched data for task ${task.id} (${task.taskType})`
      )

      // 2. PROCESS
      // Convención: process{Entity}(rawData, task)
      const processFnName = `process${entity}`
      if (!processorModule[processFnName])
        throw new Error(
          `Missing ${processFnName} in processors/${sourceName}.js`
        )

      const processedData = await processorModule[processFnName](rawData, task)
      console.log(
        `Worker ${workerId} processed data for task ${task.id} (${task.taskType})`
      )

      const msg: WorkerMessage = {
        workerId,
        status: 'done',
        taskId: task.id,
        taskType: task.taskType,
        entity,
        data: processedData,
      }

      parentPort?.postMessage(msg)
    } catch (err: any) {
      console.error(`Worker ${workerId} error:`, err.message)
      const msg: WorkerMessage = {
        workerId,
        status: 'error',
        taskId: task.id,
        taskType: task.taskType,
        error: err.message,
      }
      parentPort?.postMessage(msg)
    }
  }
  const msg: WorkerMessage = {
    workerId,
    status: 'finished',
    taskType: '',
    taskId: -1,
  }
  parentPort?.postMessage(msg)
}

await run()
