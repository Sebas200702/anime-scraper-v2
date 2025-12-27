import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { character } from './character.js'
import { staff } from './staff.js'

export const characterVoiceActor = sqliteTable(
  'character_voice_actor',
  {
    characterId: integer('character_id')
      .notNull()
      .references(() => character.malId, { onDelete: 'cascade' }),
    staffId: integer('staff_id')
      .notNull()
      .references(() => staff.malId, { onDelete: 'cascade' }),
    language: text('language').notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.staffId, t.language] })]
)
