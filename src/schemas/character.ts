import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const character = sqliteTable('character', {
  malId: integer('mal_id').primaryKey(),
  name: text('name').notNull(),
  nameKanji: text('name_kanji'),
  about: text('about'),
})

export const characterNickname = sqliteTable(
  'character_nickname',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    characterId: integer('character_id')
      .notNull()
      .references(() => character.malId, { onDelete: 'cascade' }),
    nickname: text('nickname').notNull(),
  },
  (t) => [
    uniqueIndex('character_nickname_unique').on(t.characterId, t.nickname),
  ]
)
