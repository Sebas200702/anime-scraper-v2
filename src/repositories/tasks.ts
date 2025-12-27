import { db } from '../libs/db.js'
import { eq, asc, sql, inArray, desc } from 'drizzle-orm'
import { scrapingTasks } from '../schemas/scrapingTasks.js'
import type { ScrapingTask, NewScrapingTask } from 'types/index.js'

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
      await db.insert(scrapingTasks).values(taskToInsert)

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
      let whereClause = sql`${eq(scrapingTasks.status, 'pending')} OR ${eq(scrapingTasks.status, 'in_progress')}`
      if (entityType) {
        whereClause = sql`(${whereClause}) AND ${eq(scrapingTasks.entityType, entityType)}`
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
      await db
        .update(scrapingTasks)
        .set({ status: 'completed' })
        .where(inArray(scrapingTasks.id, taskIds))
    } catch (err) {
      console.error('Error marking multiple tasks completed:', err)
      throw err
    }
  },
  async markTasksFailed(taskIds: number[], errorMsg: string): Promise<void> {
    try {
      await db
        .update(scrapingTasks)
        .set({
          status: 'failed',
          error: errorMsg,
          attempts: sql`${scrapingTasks.attempts} + 1`,
        })
        .where(inArray(scrapingTasks.id, taskIds))
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
