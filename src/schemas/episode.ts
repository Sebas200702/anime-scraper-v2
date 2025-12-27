import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { anime } from './anime.js'

export const episode = sqliteTable('episode', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  animeId: integer('anime_id')
    .notNull()
    .references(() => anime.malId, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  synopsis: text('synopsis'),
  duration: text('duration'),
  aired: text('aired'),
  number: integer('number').notNull(),
})

export const episodeSource = sqliteTable('episode_source', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  episodeId: integer('episode_id')
    .notNull()
    .references(() => episode.id, { onDelete: 'cascade' }),
  src: text('src').notNull(),
})

export const episodeSubtitle = sqliteTable('episode_subtitle', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  episodeId: integer('episode_id')
    .notNull()
    .references(() => episode.id, { onDelete: 'cascade' }),
  language: text('language').notNull(),
  src: text('src').notNull(),
})
