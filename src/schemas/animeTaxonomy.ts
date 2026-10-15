/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/anime-taxonomy` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { index, integer, pgTable, text } from 'drizzle-orm/pg-core'

export const genre = pgTable(
  'genre',
  {
    malId: integer('mal_id').primaryKey(),
    name: text('name').notNull(),
  },
  (t) => [index('genre_name_idx').on(t.name)]
)
export const theme = pgTable('theme', {
  malId: integer('mal_id').primaryKey(),
  name: text('name').notNull(),
})
export const demographic = pgTable('demographic', {
  malId: integer('mal_id').primaryKey(),
  name: text('name').notNull(),
})
