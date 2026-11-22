/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/character-external` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { sql } from 'drizzle-orm'
import { integer, pgTable, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { character } from './character.js'

export const characterExternal = pgTable(
  'character_external',
  {
    characterId: integer('character_id')
      .notNull()
      .primaryKey()
      .references(() => character.malId, { onDelete: 'cascade' }),
    malId: integer('mal_id'),
    anilistId: integer('anilist_id'),
    anidbId: integer('anidb_id'),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('character_external_mal_id_unique')
      .on(t.malId)
      .where(sql`${t.malId} IS NOT NULL`),
    uniqueIndex('character_external_anilist_id_unique')
      .on(t.anilistId)
      .where(sql`${t.anilistId} IS NOT NULL`),
  ]
)
