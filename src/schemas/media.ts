import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const media = sqliteTable(
  'media',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entityType: text('entity_type').notNull(), // anime, staff, character, episode, producer
    entityId: integer('entity_id').notNull(),
    mediaType   : text('media_type').notNull(), // image, poster, etc.
    src: text('src').notNull(),
    size: text('size'),
  },
  (t) => [
    uniqueIndex('media_entity_unique').on(
      t.entityType,
      t.entityId,
      t.mediaType,
      t.src
    ),
  ]
)
