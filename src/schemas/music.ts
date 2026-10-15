/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/music` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { index, integer, pgTable, serial, text, uniqueIndex } from 'drizzle-orm/pg-core'

export const music = pgTable('music', {
  id: integer('id').primaryKey().notNull(),
  title: text('title'),
  type: text('type').notNull(),
})
export const musicVersion = pgTable(
  'music_version',
  {
    id: serial('id').primaryKey(),
    musicId: integer('music_id')
      .notNull()
      .references(() => music.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    versionId: integer('version_id').notNull().unique(),
  },
  (t) => [index('music_version_music_id_idx').on(t.musicId)]
)
export const musicResolution = pgTable(
  'music_resolution',
  {
    id: serial('id').primaryKey(),
    musicVersionId: integer('music_version_id')
      .notNull()
      .references(() => musicVersion.versionId, { onDelete: 'cascade' }),
    songId: integer('song_id').notNull(),
    resolution: text('resolution').notNull(),
    audioUrl: text('audio_url'),
    videoUrl: text('video_url'),
  },
  (t) => [
    uniqueIndex('music_resolution_song_res_unique').on(t.songId, t.resolution),
    index('music_resolution_version_id_idx').on(t.musicVersionId),
  ]
)
