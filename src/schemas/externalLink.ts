/**
 * ESPEJO de `anidev-v2/src/lib/db/schemas/external-link` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: `bun run schema:mirror` (drift check: `bun run schema:mirror --check`).
 */

import { index, integer, pgTable, serial, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { anime } from './anime.js'
import { manga } from './manga.js'

export const animeExternalLink = pgTable(
  'anime_external_link',
  {
    id: serial('id').primaryKey(),
    animeId: integer('anime_id')
      .notNull()
      .references(() => anime.malId, { onDelete: 'cascade' }),
    site: text('site').notNull(),
    url: text('url').notNull(),
    type: text('type'),
    icon: text('icon'),
  },
  (t) => [
    uniqueIndex('anime_external_link_anime_id_url_unique').on(t.animeId, t.url),
    index('anime_external_link_site_idx').on(t.site),
  ]
)
export const mangaExternalLink = pgTable(
  'manga_external_link',
  {
    id: serial('id').primaryKey(),
    mangaId: integer('manga_id')
      .notNull()
      .references(() => manga.malId, { onDelete: 'cascade' }),
    site: text('site').notNull(),
    url: text('url').notNull(),
    type: text('type'),
    icon: text('icon'),
  },
  (t) => [
    uniqueIndex('manga_external_link_manga_id_url_unique').on(t.mangaId, t.url),
    index('manga_external_link_site_idx').on(t.site),
  ]
)
