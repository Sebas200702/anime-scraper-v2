/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/music-relations` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { music } from './music.js'
import { artist } from './artist.js'
import { integer, pgTable, primaryKey } from 'drizzle-orm/pg-core'

export const musicArtist = pgTable(
  'music_artist',
  {
    musicId: integer('music_id')
      .references(() => music.id, { onDelete: 'cascade' })
      .notNull(),
    artistId: integer('artist_id')
      .references(() => artist.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.musicId, t.artistId] })]
)
