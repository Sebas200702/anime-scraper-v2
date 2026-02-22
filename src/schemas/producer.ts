import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const producer = sqliteTable('producer', {
  malId: integer('mal_id').primaryKey(),
  established: text('established'),
  about: text('about'),
  count: integer('count'),
})

export const producerTitle = sqliteTable(
  'producer_title',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    producerId: integer('producer_id')
      .notNull()
      .references(() => producer.malId, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
  },
  (table) => [
    uniqueIndex('producer_title_unique').on(table.producerId, table.title),
  ]
)
