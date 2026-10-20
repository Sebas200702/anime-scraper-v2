/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/manga` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { index, integer, pgTable, real, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const manga = pgTable(
  'manga',
  {
    malId: integer('mal_id').primaryKey().notNull(),
    type: text('type').notNull().default('manga'),
    title: text('title').notNull(),
    titleEnglish: text('title_english'),
    titleJapanese: text('title_japanese'),
    status: text('status'),
    chapters: integer('chapters'),
    volumes: integer('volumes'),
    score: real('score'),
    scoredBy: integer('scored_by'),
    popularityRank: integer('popularity_rank'),
    ranking: integer('ranking'),
    members: integer('members'),
    favorites: integer('favorites'),
    year: integer('year'),
    synopsis: text('synopsis'),
    background: text('background'),
    source: text('source'),
    serialization: text('serialization'),
    countryOfOrigin: text('country_of_origin'),
    duration: text('duration'),
    publishedFrom: timestamp('published_from', { withTimezone: true }),
    publishedTo: timestamp('published_to', { withTimezone: true }),
  },
  (t) => [
    index('manga_year_idx').on(t.year),
    index('manga_type_idx').on(t.type),
    index('manga_score_idx').on(t.score),
    index('manga_status_idx').on(t.status),
  ]
)
export const mangaTitleSynonym = pgTable(
  'manga_title_synonym',
  {
    id: serial('id').primaryKey(),
    mangaId: integer('manga_id')
      .notNull()
      .references(() => manga.malId, { onDelete: 'cascade' }),
    title: text('title').notNull(),
  },
  (t) => [
    uniqueIndex('manga_title_synonym_manga_id_title_idx').on(t.mangaId, t.title),
    index('manga_title_synonym_title_trgm_idx').using(
      'gin',
      t.title.op('gin_trgm_ops')
    ),
  ]
)
