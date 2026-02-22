import { db } from '../libs/db.js'
import { eq, asc, sql, inArray, desc } from 'drizzle-orm'
import { scrapingTasks } from '../schemas/scrapingTasks.js'
import type { ScrapingTask, NewScrapingTask } from 'types/index.js'
import { chunk, SQLITE_MAX_VARIABLES } from '../utils/chunk.js'

export const taskRepository = {
  async createTask(task: ScrapingTask): Promise<boolean> {
    const taskToInsert = {
      entityType: task.entityType,
      entityId: task.entityId,
      taskType: task.taskType,
      priority: task.priority,
      status: task.status,
      payload: JSON.stringify(task.payload),
    }
    try {
      const [row] = await db
        .insert(scrapingTasks)
        .values(taskToInsert)
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

    const taskToInsert = tasks.map((task) => ({
      entityType: task.entityType,
      entityId: task.entityId,
      taskType: task.taskType,
      priority: task.priority,
      status: task.status,
      payload: JSON.stringify(task.payload),
    }))
    try {
      const batchSize = Math.floor(SQLITE_MAX_VARIABLES / 6)
      const chunks = chunk(taskToInsert, batchSize)
      await db.transaction(async (tx) => {
        for (const batch of chunks) {
          await tx.insert(scrapingTasks).values(batch).onConflictDoNothing()
        }
      })

      return tasks.length
    } catch (err) {
      console.error('Error creating many tasks:', err)
      throw err
    }
  },
  async getPendingTasks(
    limit: number | null,
    entityType?: string
  ): Promise<ScrapingTask[]> {
    try {
      let whereClause = eq(scrapingTasks.status, 'pending')
      if (entityType) {
        whereClause = sql`${whereClause} AND ${eq(scrapingTasks.entityType, entityType)}`
      }
      const query = db
        .select()
        .from(scrapingTasks)
        .where(whereClause)
        .orderBy(desc(scrapingTasks.priority))

      if (limit) {
        query.limit(limit)
      }

      const tasks = await query
      const returnTasks: ScrapingTask[] = tasks.map((task) => ({
        id: task.id,
        entityType: task.entityType,
        entityId: task.entityId,
        taskType: task.taskType,
        priority: task.priority,
        status: task.status,
        payload: JSON.parse(task.payload ?? '{}'),
        scheduledAt: task.scheduledAt,
        attempts: task.attempts,
        error: task.error,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      }))

      return returnTasks
    } catch (err) {
      console.error('Error fetching pending tasks:', err)
      throw err
    }
  },
  async markTaskInProgress(taskId: number): Promise<void> {
    try {
      await db
        .update(scrapingTasks)
        .set({ status: 'in_progress' })
        .where(eq(scrapingTasks.id, taskId))
    } catch (err) {
      console.error('Error marking task in progress:', err)
      throw err
    }
  },
  async markTasksInProgress(taskIds: number[]): Promise<void> {
    try {
      const chunks = chunk(taskIds, SQLITE_MAX_VARIABLES)
      await db.transaction(async (tx) => {
        for (const batch of chunks) {
          await tx
            .update(scrapingTasks)
            .set({ status: 'in_progress' })
            .where(inArray(scrapingTasks.id, batch))
        }
      })
    } catch (err) {
      console.error('Error marking tasks in progress:', err)
      throw err
    }
  },
  async markTaskCompleted(taskId: number): Promise<void> {
    try {
      await db
        .update(scrapingTasks)
        .set({ status: 'completed' })
        .where(eq(scrapingTasks.id, taskId))
    } catch (err) {
      console.error('Error marking task completed:', err)
      throw err
    }
  },
  async markTaskFailed(taskId: number, errorMsg: string): Promise<void> {
    try {
      await db
        .update(scrapingTasks)
        .set({
          status: 'failed',
          error: errorMsg,
          attempts: sql`${scrapingTasks.attempts} + 1`,
        })
        .where(eq(scrapingTasks.id, taskId))
    } catch (err) {
      console.error('Error marking task failed:', err)
      throw err
    }
  },
  async markTasksCompleted(taskIds: number[]): Promise<void> {
    try {
      const chunks = chunk(taskIds, SQLITE_MAX_VARIABLES)
      await db.transaction(async (tx) => {
        for (const batch of chunks) {
          await tx
            .update(scrapingTasks)
            .set({ status: 'completed' })
            .where(inArray(scrapingTasks.id, batch))
        }
      })
    } catch (err) {
      console.error('Error marking multiple tasks completed:', err)
      throw err
    }
  },
  async markTasksFailed(taskIds: number[], errorMsg: string): Promise<void> {
    try {
      const chunks = chunk(taskIds, SQLITE_MAX_VARIABLES)
      await db.transaction(async (tx) => {
        for (const batch of chunks) {
          await tx
            .update(scrapingTasks)
            .set({
              status: 'failed',
              error: errorMsg,
              attempts: sql`${scrapingTasks.attempts} + 1`,
            })
            .where(inArray(scrapingTasks.id, batch))
        }
      })
    } catch (err) {
      console.error('Error marking multiple tasks failed:', err)
      throw err
    }
  },
  async getCompletedTasks(
    limit: number | null,
    entityType?: string
  ): Promise<ScrapingTask[]> {
    try {
      let whereClause = eq(scrapingTasks.status, 'completed')
      if (entityType) {
        whereClause = sql`${whereClause} AND ${eq(scrapingTasks.entityType, entityType)}`
      }
      const query = db
        .select()
        .from(scrapingTasks)
        .where(whereClause)
        .orderBy(asc(scrapingTasks.scheduledAt))
      if (limit) {
        query.limit(limit)
      }

      const tasks = await query

      const returnTasks: ScrapingTask[] = tasks.map((task) => ({
        id: task.id,
        entityType: task.entityType,
        entityId: task.entityId,
        taskType: task.taskType,
        priority: task.priority,
        status: task.status,
        payload: JSON.parse(task.payload ?? '{}'),
        scheduledAt: task.scheduledAt,
        attempts: task.attempts,
        error: task.error,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      }))
      return returnTasks
    } catch (err) {
      console.error('Error fetching completed tasks:', err)
      throw err
    }
  },
  async getTaskByEntityType(
    entityType: string
  ): Promise<{ pending: ScrapingTask[]; completed: ScrapingTask[] }> {
    try {
      const resultPendingTasks = await this.getPendingTasks(null, entityType)
      const resultCompletedTasks = await this.getCompletedTasks(
        null,
        entityType
      )

      return {
        pending: resultPendingTasks,
        completed: resultCompletedTasks,
      }
    } catch (err) {
      console.error('Error fetching task by entity type:', err)
      throw err
    }
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
  /**
   * Reset orphaned in_progress tasks back to pending.
   * Called at startup to recover from crashes.
   */
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
      const task = await db
        .select()
        .from(scrapingTasks)
        .where(eq(scrapingTasks.entityType, entityType))

      const foundTasks: ScrapingTask[] = task.map((task) => ({
        id: task.id,
        entityType: task.entityType,
        entityId: task.entityId,
        taskType: task.taskType,
        priority: task.priority,
        status: task.status,
        payload: JSON.parse(task.payload ?? '{}'),
        scheduledAt: task.scheduledAt,
        attempts: task.attempts,
        error: task.error,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      }))
      return foundTasks
    } catch (err) {
      console.error('Error fetching task by entity id:', err)
      throw err
    }
  },
}
