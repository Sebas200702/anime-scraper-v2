import { config } from 'dotenv'
config()

export const CONFIG = {
  JIKAN_BASE: process.env.JIKAN_BASE || 'https://api.jikan.moe/v4',
  MAL_BASE: 'https://myanimelist.net',
  TVDB_API_KEY: process.env.TVDB_API_KEY,
  TVDB_BASE: process.env.TVDB_BASE || 'https://api4.thetvdb.com/v4',
  ANIME_THEMES_BASE: process.env.ANIME_THEMES_BASE || 'https://animethemes.moe',
  KITSU_BASE: process.env.KITSU_BASE || 'https://kitsu.io/api/edge',
  ANILIST_BASE: process.env.ANILIST_BASE || 'https://graphql.anilist.co',

  /** MAL API oficial v2 (requiere client_id gratuito de myanimelist.net/apiconfig). */
  MAL_API_BASE: process.env.MAL_API_BASE || 'https://api.myanimelist.net/v2',
  MAL_CLIENT_ID: process.env.MAL_CLIENT_ID,

  /** Postgres de ingesta (cola `ingest.*` + catálogo). Local por defecto. */
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgres://anidev:anidev@127.0.0.1:5432/scraper_local',

  /** Lease del claim: si el proceso muere, el reaper lo devuelve a `pending`. */
  TASK_LEASE_SECONDS: Number(process.env.TASK_LEASE_SECONDS || 900),

  // Credenciales para proxies que las requieren (los listados públicos suelen
  // responder 407 sin ellas, H-18).
  PROXY_USER: process.env.PROXY_USER,
  PROXY_PASS: process.env.PROXY_PASS,
}
