/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/music-stream` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { index, integer, pgTable, serial, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { music } from './music.js'

export const musicStream = pgTable(
  'music_stream',
  {
    id: serial('id').primaryKey(),
    musicId: integer('music_id')
      .notNull()
      .references(() => music.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    url: text('url').notNull(),
    externalId: text('external_id'),
    country: text('country'),
  },
  (t) => [
    uniqueIndex('music_stream_music_provider_unique').on(t.musicId, t.provider),
    index('music_stream_music_id_idx').on(t.musicId),
  ]
)
