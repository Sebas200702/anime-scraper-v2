import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
export const genre = sqliteTable('genre', {
  malId: integer('mal_id').primaryKey(),
  name: text('name').notNull(),
})

export const theme = sqliteTable('theme', {
  malId: integer('mal_id').primaryKey(),
  name: text('name').notNull(),
})

export const demographic = sqliteTable('demographic', {
  malId: integer('mal_id').primaryKey(),
  name: text('name').notNull(),
})
