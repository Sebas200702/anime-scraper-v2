/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/episode` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { integer, pgTable, serial, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { anime } from './anime.js'

export const episode = pgTable(
  'episode',
  {
    id: serial('id').primaryKey(),
    animeId: integer('anime_id')
      .notNull()
      .references(() => anime.malId, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    synopsis: text('synopsis'),
    duration: text('duration'),
    aired: text('aired'),
    number: integer('number').notNull(),
  },
  (t) => [uniqueIndex('episode_anime_number_unique').on(t.animeId, t.number)]
)
export const episodeSource = pgTable(
  'episode_source',
  {
    id: serial('id').primaryKey(),
    episodeId: integer('episode_id')
      .notNull()
      .references(() => episode.id, { onDelete: 'cascade' }),
    src: text('src').notNull(),
  },
  (t) => [uniqueIndex('episode_source_unique').on(t.episodeId, t.src)]
)
export const episodeSubtitle = pgTable(
  'episode_subtitle',
  {
    id: serial('id').primaryKey(),
    episodeId: integer('episode_id')
      .notNull()
      .references(() => episode.id, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    src: text('src').notNull(),
  },
  (t) => [
    uniqueIndex('episode_subtitle_unique').on(t.episodeId, t.language, t.src),
  ]
)
