import {
  bigserial,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import type { TaskPayload } from '../types/payload.js'

/**
 * Esquema de ingesta (`ingest.*`). El DDL es de **anidev-v2** (change
 * `ingest-queue-postgres`); aquí se refleja para poder consultarlo, exactamente
 * como los schemas del catálogo. En local las migraciones de este repo lo crean;
 * en prod lo crea anidev.
 */
export const ingest = pgSchema('ingest')

export const TASK_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'dead_letter',
  'skipped',
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

/**
 * Una fila por unidad de trabajo, identificada por
 * `(source, task_type, entity_id)`: insertar lo que falta y re-armar lo vencido
 * es idempotente, y el claim con lease evita perder slices.
 */
export const ingestTask = ingest.table(
  'task',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    source: text('source').notNull(),
    taskType: text('task_type').notNull(),
    entityId: text('entity_id').notNull(),
    payload: jsonb('payload').$type<TaskPayload>(),

    priority: integer('priority').notNull().default(0),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),

    scheduledAt: timestamp('scheduled_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leasedUntil: timestamp('leased_until', { withTimezone: true }),
    lastScrapedAt: timestamp('last_scraped_at', { withTimezone: true }),
    refreshAfter: timestamp('refresh_after', { withTimezone: true }),

    lastError: text('last_error'),
    skipReason: text('skip_reason'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('ingest_task_identity_unique').on(
      t.source,
      t.taskType,
      t.entityId
    ),
    index('ingest_task_due_idx').on(t.status, t.priority, t.scheduledAt),
    index('ingest_task_lease_idx').on(t.status, t.leasedUntil),
  ]
)

/**
 * Cadencia por tipo de tarea: es **dato**, no código, para que cambiar el
 * refresh no requiera deploy (y para que el dashboard lo edite).
 */
export const ingestTaskPolicy = ingest.table(
  'task_policy',
  {
    source: text('source').notNull(),
    taskType: text('task_type').notNull(),
    refreshIntervalSeconds: integer('refresh_interval_seconds'),
    refreshIntervalAiringSeconds: integer('refresh_interval_airing_seconds'),
    maxAttempts: integer('max_attempts').notNull().default(3),
    priority: integer('priority').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.source, t.taskType] })]
)

/** Una fila por corrida, para métricas y para el dashboard de control. */
export const ingestRun = ingest.table('run', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  source: text('source').notNull(),
  mode: text('mode').notNull().default('incremental'),
  startedAt: timestamp('started_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  tasksProcessed: integer('tasks_processed').notNull().default(0),
  tasksRetried: integer('tasks_retried').notNull().default(0),
  tasksBlocked: integer('tasks_blocked').notNull().default(0),
  tasksDeadLettered: integer('tasks_dead_lettered').notNull().default(0),
  notes: text('notes'),
})
