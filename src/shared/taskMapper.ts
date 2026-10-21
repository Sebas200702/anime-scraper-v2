import type { ScrapingTask } from '../types/index.js'

/** Fila cruda de `ingest.task` (snake_case), tal como la devuelve el claim. */
export interface RawTaskRow {
  id: number | string
  source: string
  task_type: string
  entity_id: string
  payload: unknown
  priority: number
  status: string
  attempts: number
  max_attempts: number
  scheduled_at: Date | string
  leased_until: Date | string | null
  last_scraped_at: Date | string | null
  refresh_after: Date | string | null
  last_error: string | null
  skip_reason: string | null
  created_at: Date | string
  updated_at: Date | string
}

const toDate = (value: Date | string): Date =>
  value instanceof Date ? value : new Date(value)

/** Fila de la cola (`ingest.task`) → tarea del dominio. */
export const mapTaskRow = (row: RawTaskRow): ScrapingTask => ({
  id: Number(row.id),
  source: row.source,
  taskType: row.task_type,
  entityId: row.entity_id,
  payload: (row.payload ?? {}) as Record<string, unknown>,
  priority: row.priority,
  status: row.status,
  attempts: row.attempts,
  maxAttempts: row.max_attempts,
  scheduledAt: toDate(row.scheduled_at),
  leasedUntil: row.leased_until ? toDate(row.leased_until) : null,
  lastScrapedAt: row.last_scraped_at ? toDate(row.last_scraped_at) : null,
  refreshAfter: row.refresh_after ? toDate(row.refresh_after) : null,
  lastError: row.last_error,
  skipReason: row.skip_reason,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at),
})
