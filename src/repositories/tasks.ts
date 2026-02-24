import { db } from '../libs/db.js'
import { eq, asc, sql, inArray, desc } from 'drizzle-orm'
import { scrapingTasks } from '../schemas/scrapingTasks.js'
import type { ScrapingTask, NewScrapingTask } from 'types/index.js'
import { chunk, SQLITE_MAX_VARIABLES } from '../utils/chunk.js'
import { mapTaskRow } from '../shared/taskMapper.js'

export const taskRepository = {
  async createTask(task: ScrapingTask): Promise<boolean> {
    try {
      const [row] = await db
        .insert(scrapingTasks)
        .values({
          entityType: task.entityType,
          entityId: task.entityId,
          taskType: task.taskType,
          priority: task.priority,
          status: task.status,
          payload: JSON.stringify(task.payload),
        })
        .onConflictDoNothing()
        .returning()
      return !!row
    } catch (err) {
      console.error('Error creating task:', err)
      throw err
    }
  },

  async createManyTasks(tasks: NewScrapingTask[]): Promise<number> {
    if (tasks.length === 0) return 0
    const mapped = tasks.map((t) => ({
      entityType: t.entityType,
      entityId: t.entityId,
      taskType: t.taskType,
      priority: t.priority,
      status: t.status,
      payload: JSON.stringify(t.payload),
    }))
    try {
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 6)
      await db.transaction(async (tx) => {
        for (const batch of chunk(mapped, batchSize)) {
          await tx.insert(scrapingTasks).values(batch).onConflictDoNothing()
        }
      })
      return tasks.length
    } catch (err) {
      console.error('Error creating many tasks:', err)
      throw err
    }
  },

  async queryTasks(
    status: string,
    entityType?: string,
    limit?: number | null,
    orderBy: 'priority' | 'scheduled' = 'priority'
  ): Promise<ScrapingTask[]> {
    try {
      let whereClause = eq(scrapingTasks.status, status)
      if (entityType) {
        whereClause = sql`${whereClause} AND ${eq(scrapingTasks.entityType, entityType)}`
      }
      const order =
        orderBy === 'scheduled'
          ? asc(scrapingTasks.scheduledAt)
          : desc(scrapingTasks.priority)

      const query = db
        .select()
        .from(scrapingTasks)
        .where(whereClause)
        .orderBy(order)

      if (limit) query.limit(limit)

      return (await query).map(mapTaskRow)
    } catch (err) {
      console.error(`Error fetching ${status} tasks:`, err)
      throw err
    }
  },

  async getPendingTasks(
    limit: number | null,
    entityType?: string
  ): Promise<ScrapingTask[]> {
    return this.queryTasks('pending', entityType, limit, 'priority')
  },

  async getCompletedTasks(
    limit: number | null,
    entityType?: string
  ): Promise<ScrapingTask[]> {
    return this.queryTasks('completed', entityType, limit, 'scheduled')
  },

  async markTasksStatus(
    taskIds: number[],
    status: string,
    extra?: Record<string, any>
  ): Promise<void> {
    try {
      const chunks = chunk(taskIds, SQLITE_MAX_VARIABLES)
      await db.transaction(async (tx) => {
        for (const batch of chunks) {
          await tx
            .update(scrapingTasks)
            .set({ status, ...extra })
            .where(inArray(scrapingTasks.id, batch))
        }
      })
    } catch (err) {
      console.error(`Error marking tasks ${status}:`, err)
      throw err
    }
  },

  async markTaskInProgress(taskId: number): Promise<void> {
    await this.markTasksStatus([taskId], 'in_progress')
  },

  async markTasksInProgress(taskIds: number[]): Promise<void> {
    await this.markTasksStatus(taskIds, 'in_progress')
  },

  async markTaskCompleted(taskId: number): Promise<void> {
    await this.markTasksStatus([taskId], 'completed')
  },

  async markTasksCompleted(taskIds: number[]): Promise<void> {
    await this.markTasksStatus(taskIds, 'completed')
  },

  async markTaskFailed(taskId: number, errorMsg: string): Promise<void> {
    await this.markTasksStatus([taskId], 'failed', {
      error: errorMsg,
      attempts: sql`${scrapingTasks.attempts} + 1`,
    })
  },

  async markTasksFailed(taskIds: number[], errorMsg: string): Promise<void> {
    await this.markTasksStatus(taskIds, 'failed', {
      error: errorMsg,
      attempts: sql`${scrapingTasks.attempts} + 1`,
    })
  },

  async getTaskByEntityType(
    entityType: string
  ): Promise<{ pending: ScrapingTask[]; completed: ScrapingTask[] }> {
    const [pending, completed] = await Promise.all([
      this.getPendingTasks(null, entityType),
      this.getCompletedTasks(null, entityType),
    ])
    return { pending, completed }
  },

  async getExistingEntityIds(entityType: string): Promise<Set<string>> {
    try {
      const rows = await db
        .select({ entityId: scrapingTasks.entityId })
        .from(scrapingTasks)
        .where(eq(scrapingTasks.entityType, entityType))
      return new Set(rows.map((r) => r.entityId))
    } catch (err) {
      console.error('Error fetching existing entity ids:', err)
      return new Set()
    }
  },

  async resetStaleTasks(entityType?: string): Promise<number> {
    try {
      let whereClause = eq(scrapingTasks.status, 'in_progress')
      if (entityType) {
        whereClause = sql`${whereClause} AND ${eq(scrapingTasks.entityType, entityType)}`
      }
      const result = await db
        .update(scrapingTasks)
        .set({ status: 'pending' })
        .where(whereClause)
      return result.rowsAffected
    } catch (err) {
      console.error('Error resetting stale tasks:', err)
      return 0
    }
  },

  async getTasks(entityType: string): Promise<ScrapingTask[]> {
    try {
      const rows = await db
        .select()
        .from(scrapingTasks)
        .where(eq(scrapingTasks.entityType, entityType))
      return rows.map(mapTaskRow)
    } catch (err) {
      console.error('Error fetching tasks:', err)
      throw err
    }
  },
}
