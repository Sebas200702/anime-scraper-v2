/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/manga-external` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { manga } from './manga.js'

export const mangaExternalIds = pgTable('manga_external_ids', {
  mangaId: integer('manga_id')
    .notNull()
    .primaryKey()
    .references(() => manga.malId),
  anilistId: integer('anilist_id'),
  kitsuId: integer('kitsu_id'),
  tvdbId: integer('tvdb_id'),
  anilistSiteId: text('anilist_site_id'),
  createdAt: timestamp('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at')
    .notNull()
    .$defaultFn(() => new Date()),
})
