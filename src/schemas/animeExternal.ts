/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/anime-external` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { anime } from './anime.js'

export const animeExternalIds = pgTable('anime_external_ids', {
  animeId: integer('anime_id')
    .notNull()
    .primaryKey()
    .references(() => anime.malId),
  animeThemesSlug: text('anime_themes_slug'),
  kitsuId: integer('kitsu_id'),
  tvdbId: integer('tvdb_id'),
  anilistId: integer('anilist_id'),
  annId: integer('ann_id'),
  tmdbId: integer('tmdb_id'),
  createdAt: timestamp('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at')
    .notNull()
    .$defaultFn(() => new Date()),
})
