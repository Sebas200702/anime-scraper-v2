import { integer, text, sqliteTable } from 'drizzle-orm/sqlite-core'

import { anime } from './anime.js'

export const animeExternalIds = sqliteTable('anime_external_ids', {
  animeId: integer('anime_id')
    .notNull()
    .primaryKey()
    .references(() => anime.malId),

  animeThemesSlug: text('anime_themes_slug'),
  kitsuId: integer('kitsu_id'),
  tvdbId: integer('tvdb_id'),

  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})
