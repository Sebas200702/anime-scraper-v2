import {
  integer,
  text,
  sqliteTable,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const scrapingTasks = sqliteTable(
  'scraping_tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    taskType: text('task_type').notNull(),
    entityId: text('entity_id').notNull(),
    entityType: text('entity_type').notNull(),

    priority: integer('priority').notNull(),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),

    error: text('error'),

    // JSON serializado
    payload: text('payload'),

    lastScrapedAt: integer('last_scraped_at', { mode: 'timestamp' }),

    scheduledAt: integer('scheduled_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`cast((julianday('now') - 2440587.5)*86400000 as integer)`),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`cast((julianday('now') - 2440587.5)*86400000 as integer)`),

    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`cast((julianday('now') - 2440587.5)*86400000 as integer)`),
  },
  (t) => [
    uniqueIndex('scraping_tasks_entity_type_entity_id_unique').on(
      t.entityType,
      t.entityId
    ),
  ]
)
