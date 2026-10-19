/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/anime-media, character-media, staff-media, producer-media, music-media, episode-media` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { index, integer, pgTable, serial, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { anime } from './anime.js'
import { character } from './character.js'
import { staff } from './staff.js'
import { producer } from './producer.js'
import { music } from './music.js'
import { episode } from './episode.js'

export const animeMedia = pgTable(
  'anime_media',
  {
    id: serial('id').primaryKey(),
    animeId: integer('anime_id')
      .notNull()
      .references(() => anime.malId, { onDelete: 'cascade' }),
    mediaType: text('media_type').notNull(),
    src: text('src').notNull(),
    size: text('size'),
    source: text('source'),
    priority: integer('priority').notNull().default(100),
  },
  (t) => [
    index('anime_media_anime_id_type_priority_idx').on(
      t.animeId,
      t.mediaType,
      t.priority
    ),
    // Identidad natural: una fila por (entidad, tipo, url); las variantes
    // conviven porque cambia `src`. Da un target valido a ON CONFLICT.
    uniqueIndex('anime_media_entity_type_src_unique').on(
      t.animeId,
      t.mediaType,
      t.src
    ),
  ]
)

export const characterMedia = pgTable(
  'character_media',
  {
    id: serial('id').primaryKey(),
    characterId: integer('character_id')
      .notNull()
      .references(() => character.malId, { onDelete: 'cascade' }),
    mediaType: text('media_type').notNull(),
    src: text('src').notNull(),
    size: text('size'),
    source: text('source'),
    priority: integer('priority').notNull().default(100),
  },
  (t) => [
    index('character_media_character_id_type_priority_idx').on(
      t.characterId,
      t.mediaType,
      t.priority
    ),
    uniqueIndex('character_media_entity_type_src_unique').on(
      t.characterId,
      t.mediaType,
      t.src
    ),
  ]
)

export const staffMedia = pgTable(
  'staff_media',
  {
    id: serial('id').primaryKey(),
    staffId: integer('staff_id')
      .notNull()
      .references(() => staff.malId, { onDelete: 'cascade' }),
    mediaType: text('media_type').notNull(),
    src: text('src').notNull(),
    size: text('size'),
    source: text('source'),
    priority: integer('priority').notNull().default(100),
  },
  (t) => [
    index('staff_media_staff_id_type_priority_idx').on(
      t.staffId,
      t.mediaType,
      t.priority
    ),
    // Identidad natural: una fila por (entidad, tipo, url); las variantes
    // conviven porque cambia `src`. Da un target valido a ON CONFLICT.
    uniqueIndex('staff_media_entity_type_src_unique').on(
      t.staffId,
      t.mediaType,
      t.src
    ),
  ]
)

export const producerMedia = pgTable(
  'producer_media',
  {
    id: serial('id').primaryKey(),
    producerId: integer('producer_id')
      .notNull()
      .references(() => producer.malId, { onDelete: 'cascade' }),
    mediaType: text('media_type').notNull(),
    src: text('src').notNull(),
    size: text('size'),
    source: text('source'),
    priority: integer('priority').notNull().default(100),
  },
  (t) => [
    index('producer_media_producer_id_type_priority_idx').on(
      t.producerId,
      t.mediaType,
      t.priority
    ),
    uniqueIndex('producer_media_entity_type_src_unique').on(
      t.producerId,
      t.mediaType,
      t.src
    ),
  ]
)

export const musicMedia = pgTable(
  'music_media',
  {
    id: serial('id').primaryKey(),
    musicId: integer('music_id')
      .notNull()
      .references(() => music.id, { onDelete: 'cascade' }),
    mediaType: text('media_type').notNull(),
    src: text('src').notNull(),
    size: text('size'),
    source: text('source'),
    priority: integer('priority').notNull().default(100),
  },
  (t) => [
    index('music_media_music_id_type_priority_idx').on(
      t.musicId,
      t.mediaType,
      t.priority
    ),
    // Identidad natural: una fila por (entidad, tipo, url); las variantes
    // conviven porque cambia `src`. Da un target valido a ON CONFLICT.
    uniqueIndex('music_media_entity_type_src_unique').on(
      t.musicId,
      t.mediaType,
      t.src
    ),
  ]
)

export const episodeMedia = pgTable(
  'episode_media',
  {
    id: serial('id').primaryKey(),
    episodeId: integer('episode_id')
      .notNull()
      .references(() => episode.id, { onDelete: 'cascade' }),
    mediaType: text('media_type').notNull(),
    src: text('src').notNull(),
    size: text('size'),
    source: text('source'),
    priority: integer('priority').notNull().default(100),
  },
  (t) => [
    index('episode_media_episode_id_type_priority_idx').on(
      t.episodeId,
      t.mediaType,
      t.priority
    ),
    uniqueIndex('episode_media_entity_type_src_unique').on(
      t.episodeId,
      t.mediaType,
      t.src
    ),
  ]
)
