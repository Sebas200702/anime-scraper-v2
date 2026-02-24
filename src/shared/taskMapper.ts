import type { ScrapingTask } from '../types/index.js'

/**
 * Maps a raw DB scraping task row to the domain ScrapingTask interface.
 * Eliminates duplication across 3 methods in tasks.ts that all do the same mapping.
 */
export function mapTaskRow(row: {
  id: number
  entityType: string
  entityId: string
  taskType: string
  priority: number
  status: string
  payload: string | null
  scheduledAt: Date | null
  attempts: number
  error: string | null
  createdAt: Date
  updatedAt: Date
}): ScrapingTask {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    taskType: row.taskType,
    priority: row.priority,
    status: row.status,
    payload: JSON.parse(row.payload ?? '{}'),
    scheduledAt: row.scheduledAt,
    attempts: row.attempts,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
