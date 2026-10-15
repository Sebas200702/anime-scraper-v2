/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/anime` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { index, integer, pgTable, real, serial, text, uniqueIndex } from 'drizzle-orm/pg-core'

export const anime = pgTable(
  'anime',
  {
    malId: integer('mal_id').primaryKey().notNull(),
    title: text('title').notNull(),
    titleEnglish: text('title_english'),
    titleJapanese: text('title_japanese'),
    type: text('type'),
    status: text('status'),
    episodes: integer('episodes'),
    score: real('score'),
    scoredBy: integer('scored_by'),
    popularityRank: integer('popularity_rank'),
    rating: text('rating'),
    year: integer('year'),
    season: text('season'),
    synopsis: text('synopsis'),
    background: text('background'),
  },
  (t) => [
    index('anime_year_idx').on(t.year),
    index('anime_season_idx').on(t.season),
    index('anime_score_idx').on(t.score),
    index('anime_status_idx').on(t.status),
    index('anime_type_idx').on(t.type),
    index('anime_rating_idx').on(t.rating),
  ]
)
export const animeTitleSynonym = pgTable(
  'anime_title_synonym',
  {
    id: serial('id').primaryKey(),
    animeId: integer('anime_id')
      .notNull()
      .references(() => anime.malId, { onDelete: 'cascade' }),
    title: text('title').notNull(),
  },
  (t) => [
    uniqueIndex('anime_title_synonym_anime_id_title_idx').on(
      t.animeId,
      t.title
    ),
    index('anime_title_synonym_title_trgm_idx').using(
      'gin',
      t.title.op('gin_trgm_ops')
    ),
  ]
)
