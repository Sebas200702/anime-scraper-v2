/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/manga-relations` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { character } from './character.js'
import { demographic, genre, theme } from './animeTaxonomy.js'
import { manga } from './manga.js'
import { producer } from './producer.js'
import { staff } from './staff.js'

export const mangaGenre = pgTable(
  'manga_genre',
  {
    mangaId: integer('manga_id')
      .notNull()
      .references(() => manga.malId, { onDelete: 'cascade' }),
    genreId: integer('genre_id')
      .notNull()
      .references(() => genre.malId, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.mangaId, t.genreId] })]
)
export const mangaTheme = pgTable(
  'manga_theme',
  {
    mangaId: integer('manga_id')
      .notNull()
      .references(() => manga.malId, { onDelete: 'cascade' }),
    themeId: integer('theme_id')
      .notNull()
      .references(() => theme.malId, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.mangaId, t.themeId] })]
)
export const mangaDemographic = pgTable(
  'manga_demographic',
  {
    mangaId: integer('manga_id')
      .notNull()
      .references(() => manga.malId, { onDelete: 'cascade' }),
    demographicId: integer('demographic_id')
      .notNull()
      .references(() => demographic.malId, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.mangaId, t.demographicId] })]
)
export const mangaStaff = pgTable(
  'manga_staff',
  {
    mangaId: integer('manga_id')
      .notNull()
      .references(() => manga.malId, { onDelete: 'cascade' }),
    staffId: integer('staff_id')
      .notNull()
      .references(() => staff.malId, { onDelete: 'cascade' }),
    role: text('role').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.mangaId, t.staffId, t.role] }),
    index('manga_staff_staff_id_idx').on(t.staffId),
  ]
)
export const mangaCharacter = pgTable(
  'manga_character',
  {
    mangaId: integer('manga_id')
      .notNull()
      .references(() => manga.malId, { onDelete: 'cascade' }),
    characterId: integer('character_id')
      .notNull()
      .references(() => character.malId, { onDelete: 'cascade' }),
    role: text('role').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.mangaId, t.characterId, t.role] }),
    index('manga_character_character_id_idx').on(t.characterId),
  ]
)
export const mangaProducer = pgTable(
  'manga_producer',
  {
    mangaId: integer('manga_id')
      .notNull()
      .references(() => manga.malId, { onDelete: 'cascade' }),
    producerId: integer('producer_id')
      .notNull()
      .references(() => producer.malId, { onDelete: 'cascade' }),
    role: text('role').notNull().default('publisher'),
  },
  (t) => [
    primaryKey({ columns: [t.mangaId, t.producerId, t.role] }),
    index('manga_producer_role_idx').on(t.role, t.producerId),
  ]
)
export const mangaRelation = pgTable(
  'manga_relation',
  {
    mangaId: integer('manga_id')
      .notNull()
      .references(() => manga.malId, { onDelete: 'cascade' }),
    relatedMangaId: integer('related_manga_id')
      .notNull()
      .references(() => manga.malId, { onDelete: 'cascade' }),
    relationType: text('relation_type').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.mangaId, t.relatedMangaId, t.relationType] }),
    index('manga_relation_related_manga_id_idx').on(t.relatedMangaId),
  ]
)
