import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const music = sqliteTable('music', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title'),
  type: text('type').notNull(),
})

export const musicVersion = sqliteTable(
  'music_version',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    musicId: integer('music_id')
      .notNull()
      .references(() => music.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    versionId: integer('version_id').notNull(),
  },
  (t) => [uniqueIndex('music_version_unique').on(t.musicId, t.versionId)]
)

export const musicResolution = sqliteTable('music_resolution', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  musicVersionId: integer('music_version_id')
    .notNull()
    .references(() => musicVersion.id, { onDelete: 'cascade' }),
  songId: integer('song_id').notNull(),
  resolution: integer('resolution').notNull(),
  audioUrl: text('audio_url'),
  videoUrl: text('video_url'),
})
