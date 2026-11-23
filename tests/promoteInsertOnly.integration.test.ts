import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { CONFIG } from '../src/config/config.js'
import {
  PROMOTION_PLAN,
  promote,
  toInsertOnlyPlan,
} from '../src/libs/promotion.js'

/**
 * `promote --insert-only` contra dos Postgres desechables: el destino ya tiene
 * valores más nuevos que el origen y solo deben entrar las filas que faltan.
 * Cubre tablas sin columna `id` (anime, genre, anime_genre) y una tabla de
 * media con `id` serial (anime_media).
 */
const RUN = Boolean(process.env.RUN_DB_TESTS)
const SOURCE_DB = 'promote_io_source'
const TARGET_DB = 'promote_io_target'
const BASE = CONFIG.DATABASE_URL
const adminUrl = BASE.replace(/\/[^/]+$/, '/postgres')
const sourceUrl = BASE.replace(/\/[^/]+$/, `/${SOURCE_DB}`)
const targetUrl = BASE.replace(/\/[^/]+$/, `/${TARGET_DB}`)

const KNOWN = 991001
const NEW = 991002
const GENRE_KNOWN = 991001
const GENRE_NEW = 991002

let source: Pool
let target: Pool

const migrated = async (url: string) => {
  const pool = new Pool({ connectionString: url })
  await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  return pool
}

beforeAll(async () => {
  if (!RUN) return

  const admin = new Pool({ connectionString: adminUrl })
  for (const db of [SOURCE_DB, TARGET_DB]) {
    await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`)
    await admin.query(`CREATE DATABASE ${db}`)
  }
  await admin.end()

  source = await migrated(sourceUrl)
  target = await migrated(targetUrl)

  // Origen (más viejo): valores antiguos para lo conocido + filas nuevas.
  await source.query(
    `INSERT INTO genre (mal_id, name) VALUES ($1, 'Old Genre'), ($2, 'New Genre')`,
    [GENRE_KNOWN, GENRE_NEW]
  )
  await source.query(
    `INSERT INTO anime (mal_id, title, episodes) VALUES ($1, 'Old Title', 12), ($2, 'New Anime', 24)`,
    [KNOWN, NEW]
  )
  await source.query(
    `INSERT INTO anime_genre (anime_id, genre_id) VALUES ($1, $3), ($2, $4)`,
    [KNOWN, NEW, GENRE_KNOWN, GENRE_NEW]
  )
  await source.query(
    `INSERT INTO anime_media (anime_id, media_type, src, size)
     VALUES ($1, 'poster', 'http://x/known.jpg', 'small'),
            ($2, 'poster', 'http://x/new.jpg', 'large')`,
    [KNOWN, NEW]
  )

  // Destino (más nuevo): mismas claves con valores actualizados.
  await target.query(
    `INSERT INTO genre (mal_id, name) VALUES ($1, 'Newer Genre')`,
    [GENRE_KNOWN]
  )
  await target.query(
    `INSERT INTO anime (mal_id, title, episodes) VALUES ($1, 'Newer Title', 13)`,
    [KNOWN]
  )
  await target.query(
    `INSERT INTO anime_genre (anime_id, genre_id) VALUES ($1, $2)`,
    [KNOWN, GENRE_KNOWN]
  )
  await target.query(
    `INSERT INTO anime_media (anime_id, media_type, src, size)
     VALUES ($1, 'poster', 'http://x/known.jpg', 'large')`,
    [KNOWN]
  )
})

afterAll(async () => {
  if (!RUN) return
  await source?.end()
  await target?.end()
  const admin = new Pool({ connectionString: adminUrl })
  for (const db of [SOURCE_DB, TARGET_DB]) {
    await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`)
  }
  await admin.end()
})

const planFor = (tables: string[]) =>
  toInsertOnlyPlan(PROMOTION_PLAN.filter((step) => tables.includes(step.table)))

const TABLES = ['genre', 'anime', 'anime_media', 'anime_genre']

describe.skipIf(!RUN)('promote --insert-only (dos DBs)', () => {
  test('dry-run de una tabla sin columna id no falla ni escribe', async () => {
    const report = await promote({
      source,
      target,
      dryRun: true,
      plan: planFor(['anime']),
      log: () => {},
    })
    expect(report.tables.map((t) => [t.table, t.inserted])).toEqual([
      ['anime', 1],
    ])
    const { rows } = await target.query(
      'SELECT count(*)::int AS n FROM anime WHERE mal_id = $1',
      [NEW]
    )
    expect(rows[0].n).toBe(0)
  })

  test('inserta solo lo que falta y nunca pisa el destino', async () => {
    const report = await promote({
      source,
      target,
      plan: planFor(TABLES),
      log: () => {},
    })
    const counts = Object.fromEntries(
      report.tables.map((t) => [
        t.table,
        { inserted: t.inserted, updated: t.updated, unchanged: t.unchanged },
      ])
    )
    for (const table of TABLES)
      expect(counts[table]).toEqual({ inserted: 1, updated: 0, unchanged: 1 })

    const anime = await target.query(
      'SELECT mal_id, title, episodes FROM anime ORDER BY mal_id'
    )
    expect(anime.rows).toEqual([
      { mal_id: KNOWN, title: 'Newer Title', episodes: 13 },
      { mal_id: NEW, title: 'New Anime', episodes: 24 },
    ])
    const genres = await target.query(
      'SELECT mal_id, name FROM genre ORDER BY mal_id'
    )
    expect(genres.rows).toEqual([
      { mal_id: GENRE_KNOWN, name: 'Newer Genre' },
      { mal_id: GENRE_NEW, name: 'New Genre' },
    ])
    const junction = await target.query(
      'SELECT anime_id, genre_id FROM anime_genre ORDER BY anime_id'
    )
    expect(junction.rows).toEqual([
      { anime_id: KNOWN, genre_id: GENRE_KNOWN },
      { anime_id: NEW, genre_id: GENRE_NEW },
    ])
    const media = await target.query(
      'SELECT anime_id, src, size FROM anime_media ORDER BY anime_id'
    )
    expect(media.rows).toEqual([
      { anime_id: KNOWN, src: 'http://x/known.jpg', size: 'large' },
      { anime_id: NEW, src: 'http://x/new.jpg', size: 'large' },
    ])
  })

  test('la secuencia de anime_media sigue sana tras promover', async () => {
    await target.query(
      `INSERT INTO anime_media (anime_id, media_type, src, size)
       VALUES ($1, 'banner', 'http://x/after.jpg', 'large')`,
      [NEW]
    )
    const { rows } = await target.query(
      'SELECT count(*)::int AS n FROM anime_media'
    )
    expect(rows[0].n).toBe(3)
  })

  test('re-ejecutar no inserta nada', async () => {
    const report = await promote({
      source,
      target,
      plan: planFor(TABLES),
      log: () => {},
    })
    for (const table of report.tables) {
      expect(table.inserted).toBe(0)
      expect(table.updated).toBe(0)
    }
  })
})
