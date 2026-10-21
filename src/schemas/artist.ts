/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/artist` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { integer, pgTable, serial, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { staff } from './staff.js'

export const artist = pgTable(
  'artist',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    malId: integer('mal_id').references(() => staff.malId),
  },
  (t) => [uniqueIndex('artist_name_unique').on(t.name)]
)
