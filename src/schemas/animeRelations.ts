import { anime } from './anime.js'
import { music } from './music.js'
import { character } from './character.js'
import { producer } from './producer.js'
import { genre, demographic, theme } from './animeTaxonomy.js'
import { staff } from './staff.js'

import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const animeGenre = sqliteTable(
  'anime_genre',
  {
    animeId: integer('anime_id')
      .notNull()
      .references(() => anime.malId, { onDelete: 'cascade' }),
    genreId: integer('genre_id')
      .notNull()
      .references(() => genre.malId, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.animeId, t.genreId] })]
)

export const animeTheme = sqliteTable(
  'anime_theme',
  {
    animeId: integer('anime_id')
      .notNull()
      .references(() => anime.malId, { onDelete: 'cascade' }),
    themeId: integer('theme_id')
      .notNull()
      .references(() => theme.malId, { onDelete: 'cascade' }),
    type: text('type'),
  },
  (t) => [primaryKey({ columns: [t.animeId, t.themeId] })]
)

export const animeDemographic = sqliteTable(
  'anime_demographic',
  {
    animeId: integer('anime_id')
      .notNull()
      .references(() => anime.malId, { onDelete: 'cascade' }),
    demographicId: integer('demographic_id')
      .notNull()
      .references(() => demographic.malId, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.animeId, t.demographicId] })]
)

export const animeStaff = sqliteTable(
  'anime_staff',
  {
    animeId: integer('anime_id')
      .notNull()
      .references(() => anime.malId, { onDelete: 'cascade' }),
    staffId: integer('staff_id')
      .notNull()
      .references(() => staff.malId, { onDelete: 'cascade' }),
    role: text('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.animeId, t.staffId, t.role] })]
)

export const animeMusic = sqliteTable(
  'anime_music',
  {
    animeId: integer('anime_id')
      .references(() => anime.malId)
      .notNull(),
    musicId: integer('music_id')
      .references(() => music.id)
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.animeId, t.musicId] })]
)

export const animeCharacter = sqliteTable(
  'anime_character',
  {
    animeId: integer('anime_id')
      .notNull()
      .references(() => anime.malId, { onDelete: 'cascade' }),
    characterId: integer('character_id')
      .notNull()
      .references(() => character.malId, { onDelete: 'cascade' }),
    role: text('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.animeId, t.characterId, t.role] })]
)

export const animeRelatedAnime = sqliteTable(
  'anime_relation',
  {
    animeId: integer('anime_id')
      .references(() => anime.malId)
      .notNull(),
    relationType: text('relation_type').notNull(),
    relatedAnimeId: integer('related_anime_id')
      .references(() => anime.malId)
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.animeId, t.relatedAnimeId, t.relationType] }),
  ]
)

export const animeProducer = sqliteTable(
  'anime_producer',
  {
    animeId: integer('anime_id')
      .notNull()
      .references(() => anime.malId, { onDelete: 'cascade' }),
    producerId: integer('producer_id')
      .notNull()
      .references(() => producer.malId, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.animeId, t.producerId] })]
)
