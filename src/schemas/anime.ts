import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const anime = sqliteTable('anime', {
  malId: integer('mal_id').primaryKey(),
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
})

export const animeTitleSynonym = sqliteTable(
  'anime_title_synonym',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
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
  ]
)
