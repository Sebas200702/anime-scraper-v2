import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const staff = sqliteTable('staff', {
  malId: integer('mal_id').primaryKey(),
  name: text('name').notNull(),
  givenName: text('given_name'),
  familyName: text('family_name'),
  birthday: text('birthday'),
  about: text('about'),
})

export const staffAlternativeName = sqliteTable(
  'staff_alternative_name',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    staffId: integer('staff_id')
      .notNull()
      .references(() => staff.malId, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (t) => [uniqueIndex('staff_alt_name_unique').on(t.staffId, t.name)]
)
