/**
 * Drizzle Kit para la DB **local** de ingesta (cola `ingest.*` + catálogo).
 *
 * En prod el DDL es de anidev-v2: el scraper solo refleja su esquema
 * (`bun run schema:mirror`) y aquí genera las migraciones del entorno local.
 */
import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config()

export default defineConfig({
  schema: './src/schemas/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://anidev:anidev@127.0.0.1:5432/scraper_local',
  },
})
