import { music } from './music.js'
import { artist } from './artist.js'
import { sqliteTable, integer } from 'drizzle-orm/sqlite-core'

export const musicArtist = sqliteTable('music_artist', {
  musicId: integer('music_id')
    .references(() => music.id)
    .notNull(),
  artistId: integer('artist_id')
    .references(() => artist.id)
    .notNull(),
})
