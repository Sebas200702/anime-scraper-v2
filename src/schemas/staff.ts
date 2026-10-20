/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/staff` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { integer, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const staff = pgTable('staff', {
  malId: integer('mal_id').primaryKey(),
  name: text('name').notNull(),
  givenName: text('given_name'),
  familyName: text('family_name'),
  birthday: text('birthday'),
  about: text('about'),
  anilistId: integer('anilist_id'),
  gender: text('gender'),
  dateOfBirth: timestamp('date_of_birth', { withTimezone: true }),
  favorites: integer('favorites'),
  voiceActorMalId: integer('voice_actor_mal_id'),
})
export const staffAlternativeName = pgTable(
  'staff_alternative_name',
  {
    id: serial('id').primaryKey(),
    staffId: integer('staff_id')
      .notNull()
      .references(() => staff.malId, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (t) => [uniqueIndex('staff_alt_name_unique').on(t.staffId, t.name)]
)
