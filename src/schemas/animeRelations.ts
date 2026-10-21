/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/anime-entity-relations, anime-taxonomy-relations` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { anime } from './anime.js'
import { music } from './music.js'
import { character } from './character.js'
import { producer } from './producer.js'
import { staff } from './staff.js'
import { index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { demographic, genre, theme } from './animeTaxonomy.js'

export const animeStaff = pgTable(
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
export const animeMusic = pgTable(
  'anime_music',
  {
    animeId: integer('anime_id')
      .references(() => anime.malId, { onDelete: 'cascade' })
      .notNull(),
    musicId: integer('music_id')
      .references(() => music.id, { onDelete: 'cascade' })
      .notNull(),
    sequence: integer('sequence'),
    episodes: text('episodes'),
  },
  (t) => [primaryKey({ columns: [t.animeId, t.musicId] })]
)
export const animeCharacter = pgTable(
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
export const animeRelatedAnime = pgTable(
  'anime_relation',
  {
    animeId: integer('anime_id')
      .references(() => anime.malId, { onDelete: 'cascade' })
      .notNull(),
    relationType: text('relation_type').notNull(),
    relatedAnimeId: integer('related_anime_id')
      .references(() => anime.malId, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.animeId, t.relatedAnimeId, t.relationType] }),
  ]
)
export const animeProducer = pgTable(
  'anime_producer',
  {
    animeId: integer('anime_id')
      .notNull()
      .references(() => anime.malId, { onDelete: 'cascade' }),
    producerId: integer('producer_id')
      .notNull()
      .references(() => producer.malId, { onDelete: 'cascade' }),
    role: text('role').notNull().default('producer'),
  },
  (t) => [
    primaryKey({ columns: [t.animeId, t.producerId, t.role] }),
    index('anime_producer_role_idx').on(t.role, t.producerId),
  ]
)

export const animeGenre = pgTable(
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
export const animeTheme = pgTable(
  'anime_theme',
  {
    animeId: integer('anime_id')
      .notNull()
      .references(() => anime.malId, { onDelete: 'cascade' }),
    themeId: integer('theme_id')
      .notNull()
      .references(() => theme.malId, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.animeId, t.themeId] })]
)
export const animeDemographic = pgTable(
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
