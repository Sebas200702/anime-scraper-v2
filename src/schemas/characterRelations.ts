/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/character-relations` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { character } from './character.js'
import { staff } from './staff.js'

export const characterVoiceActor = pgTable(
  'character_voice_actor',
  {
    characterId: integer('character_id')
      .notNull()
      .references(() => character.malId, { onDelete: 'cascade' }),
    staffId: integer('staff_id')
      .notNull()
      .references(() => staff.malId, { onDelete: 'cascade' }),
    language: text('language').notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.staffId, t.language] })]
)
