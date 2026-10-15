/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/producer` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { integer, pgTable, serial, text, uniqueIndex } from 'drizzle-orm/pg-core'

export const producer = pgTable('producer', {
  malId: integer('mal_id').primaryKey(),
  established: text('established'),
  about: text('about'),
  count: integer('count'),
})
export const producerTitle = pgTable(
  'producer_title',
  {
    id: serial('id').primaryKey(),
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
