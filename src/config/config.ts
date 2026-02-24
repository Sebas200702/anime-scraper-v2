import { config } from 'dotenv'
config()

export const CONFIG = {
  JIKAN_BASE: process.env.JIKAN_BASE || 'https://api.jikan.moe/v4',
  MAL_BASE: 'https://myanimelist.net',
  TVDB_API_KEY: process.env.TVDB_API_KEY,
  TVDB_BASE: process.env.TVDB_BASE || 'https://api4.thetvdb.com/v4',
  ANIME_THEMES_BASE:
    process.env.ANIME_THEMES_BASE ||
    'https://animethemes.moe/_next/data/VWF_eO0-IV7PSTArS1q1e',
  KITSU_BASE: process.env.KITSU_BASE || 'https://kitsu.io/api/edge',
  ANILIST_BASE: process.env.ANILIST_BASE || 'https://graphql.anilist.co',
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || '',
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || '',
}
