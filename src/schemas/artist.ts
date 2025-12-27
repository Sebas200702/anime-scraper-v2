import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { staff } from './staff.js'

export const artist = sqliteTable('artist', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  name: text('name').notNull(),

  malId: integer('mal_id')
    .references(() => staff.malId),
})
