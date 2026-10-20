/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/character` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { integer, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const character = pgTable('character', {
  malId: integer('mal_id').primaryKey(),
  name: text('name').notNull(),
  nameKanji: text('name_kanji'),
  about: text('about'),
  anilistId: integer('anilist_id'),
  gender: text('gender'),
  dateOfBirth: timestamp('date_of_birth', { withTimezone: true }),
  bloodType: text('blood_type'),
  height: integer('height'),
  weight: integer('weight'),
  age: text('age'),
  favorites: integer('favorites'),
})
export const characterNickname = pgTable(
  'character_nickname',
  {
    id: serial('id').primaryKey(),
    characterId: integer('character_id')
      .notNull()
      .references(() => character.malId, { onDelete: 'cascade' }),
    nickname: text('nickname').notNull(),
  },
  (t) => [
    uniqueIndex('character_nickname_unique').on(t.characterId, t.nickname),
  ]
)
