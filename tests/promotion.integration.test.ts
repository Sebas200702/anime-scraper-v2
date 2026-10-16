import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { CONFIG } from '../src/config/config.js'
import { promote } from '../src/libs/promotion.js'

/**
 * Promoción real contra dos Postgres: el origen (DB local de ingesta) y un
 * destino recién migrado. Prueba lo que de verdad importa del diff-upsert:
 * remap de ids surrogate, idempotencia y detección de cambios.
 */
const RUN = Boolean(process.env.RUN_DB_TESTS)
const TARGET_DB = 'promote_target'
const BASE = CONFIG.DATABASE_URL
const adminUrl = BASE.replace(/\/[^/]+$/, '/postgres')
const targetUrl = BASE.replace(/\/[^/]+$/, `/${TARGET_DB}`)

const ANIME_A = 990001
const ANIME_B = 990002

let source: Pool
let target: Pool

const cleanupSource = async () => {
  await source.query(
    'DELETE FROM episode_source WHERE episode_id IN (SELECT id FROM episode WHERE anime_id IN ($1,$2))',
    [ANIME_A, ANIME_B]
  )
  await source.query('DELETE FROM episode WHERE anime_id IN ($1,$2)', [
    ANIME_A,
    ANIME_B,
  ])
  await source.query('DELETE FROM anime_media WHERE anime_id IN ($1,$2)', [
    ANIME_A,
    ANIME_B,
  ])
  await source.query(
    'DELETE FROM anime_title_synonym WHERE anime_id IN ($1,$2)',
    [ANIME_A, ANIME_B]
  )
  await source.query('DELETE FROM anime_genre WHERE anime_id IN ($1,$2)', [
    ANIME_A,
    ANIME_B,
  ])
  await source.query('DELETE FROM anime WHERE mal_id IN ($1,$2)', [
    ANIME_A,
    ANIME_B,
  ])
  await source.query(
    "DELETE FROM music_artist WHERE artist_id IN (SELECT id FROM artist WHERE name LIKE 'Test Artist%')"
  )
  await source.query("DELETE FROM artist WHERE name LIKE 'Test Artist%'")
  await source.query("DELETE FROM music WHERE title LIKE 'Test Song%'")
}

beforeAll(async () => {
  if (!RUN) return

  const admin = new Pool({ connectionString: adminUrl })
  await admin.query(`DROP DATABASE IF EXISTS ${TARGET_DB} WITH (FORCE)`)
  await admin.query(`CREATE DATABASE ${TARGET_DB}`)
  await admin.end()

  target = new Pool({ connectionString: targetUrl })
  await target.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')
  await migrate(drizzle(target), { migrationsFolder: './drizzle' })

  source = new Pool({ connectionString: BASE })

  // limpieza previa + datos de prueba
  await cleanupSource()
  await source.query(
    `INSERT INTO anime (mal_id, title) VALUES ($1, 'Test Anime A'), ($2, 'Test Anime B')
     ON CONFLICT (mal_id) DO NOTHING`,
    [ANIME_A, ANIME_B]
  )
  await source.query(
    `INSERT INTO genre (mal_id, name) VALUES (990001, 'TestGenre') ON CONFLICT DO NOTHING`
  )
  await source.query(
    `INSERT INTO anime_genre (anime_id, genre_id) VALUES ($1, 990001)`,
    [ANIME_A]
  )
  await source.query(
    `INSERT INTO anime_title_synonym (anime_id, title) VALUES ($1, 'Test Synonym')`,
    [ANIME_A]
  )
  await source.query(
    `INSERT INTO anime_media (anime_id, media_type, src, size) VALUES ($1, 'poster', 'http://x/p.jpg', 'large')`,
    [ANIME_A]
  )
  await source.query(
    `INSERT INTO artist (name) VALUES ('Test Artist One'), ('Test Artist Two')`
  )
  await source.query(
    `INSERT INTO music (id, title, type) VALUES (990001, 'Test Song', 'OP')`
  )
  const artists = await source.query(
    `SELECT id FROM artist WHERE name LIKE 'Test Artist%' ORDER BY id`
  )
  for (const artist of artists.rows) {
    await source.query(
      `INSERT INTO music_artist (music_id, artist_id) VALUES (990001, $1)`,
      [artist.id]
    )
  }
  await source.query(
    `INSERT INTO episode (anime_id, number, title) VALUES ($1, 1, 'Ep 1'), ($1, 2, 'Ep 2')`,
    [ANIME_A]
  )
  const episodes = await source.query(
    `SELECT id FROM episode WHERE anime_id = $1 ORDER BY number`,
    [ANIME_A]
  )
  await source.query(
    `INSERT INTO episode_source (episode_id, src) VALUES ($1, 'http://x/1.mp4')`,
    [episodes.rows[0].id]
  )

  // Destino: ids surrogate DISTINTOS a propósito para probar el remap, y el
  // anime A ya presente (mismo título ⇒ no-op) para respetar las FKs.
  await target.query(
    `INSERT INTO anime (mal_id, title) VALUES ($1, 'Test Anime A')`,
    [ANIME_A]
  )
  await target.query(
    `INSERT INTO artist (id, name) VALUES (880001, 'Test Artist One')`
  )
  await target.query(
    `INSERT INTO episode (id, anime_id, number, title) VALUES (880003, $1, 1, 'Ep 1')`,
    [ANIME_A]
  )
  await target
    .query(`UPDATE music SET title = 'Test Song' WHERE id = 990001`)
    .catch(() => {})
})

afterAll(async () => {
  if (!RUN) return
  await cleanupSource()
  await source.end()
  await target.end()
  const admin = new Pool({ connectionString: adminUrl })
  await admin.query(`DROP DATABASE IF EXISTS ${TARGET_DB} WITH (FORCE)`)
  await admin.end()
})

const count = async (query: string, params: unknown[] = []) =>
  Number((await target.query(query, params)).rows[0].count)

describe.skipIf(!RUN)('promoción diff-upsert (Modo A → prod)', () => {
  test('promueve en orden FK-safe y remapea los ids surrogate', async () => {
    const report = await promote({ source, target, log: () => {} })
    const byTable = Object.fromEntries(
      report.tables.map((table) => [table.table, table])
    )

    expect(byTable.anime?.inserted).toBe(1) // B entra; A ya existía idéntica
    expect(byTable.anime?.unchanged).toBe(1)
    expect(byTable.anime_genre?.inserted).toBe(1)

    // artist: el destino ya tenía "Test Artist One" (otro id) ⇒ sin cambios, y
    // el segundo se inserta.
    expect(byTable.artist?.inserted).toBe(1)
    expect(byTable.artist?.unchanged).toBe(1)

    // El remap es lo importante: music_artist debe apuntar al id del DESTINO.
    const musicArtists = await target.query(
      `SELECT ma.artist_id, a.name FROM music_artist ma JOIN artist a ON a.id = ma.artist_id
       WHERE ma.music_id = 990001 ORDER BY a.name`
    )
    expect(musicArtists.rows.map((r) => r.name)).toEqual([
      'Test Artist One',
      'Test Artist Two',
    ])
    expect(
      musicArtists.rows.find((r) => r.name === 'Test Artist One')?.artist_id
    ).toBe(880001)

    // episode: el destino ya tenía (anime_id=990001, number=1) con otro id;
    // episode_source debe colgar del id del destino.
    const sources = await target.query('SELECT episode_id FROM episode_source')
    expect(sources.rows[0]?.episode_id).toBe(880003)
  })

  test('re-ejecutar es un no-op (idempotente)', async () => {
    const report = await promote({ source, target, log: () => {} })
    const inserted = report.tables.reduce((acc, t) => acc + t.inserted, 0)
    const updated = report.tables.reduce((acc, t) => acc + t.updated, 0)

    expect(inserted).toBe(0)
    expect(updated).toBe(0)
    expect(
      report.tables.reduce((acc, t) => acc + t.unchanged, 0)
    ).toBeGreaterThan(0)
  })

  test('solo actualiza lo que cambió en el origen', async () => {
    await source.query(
      `UPDATE anime SET title = 'Test Anime A v2' WHERE mal_id = $1`,
      [ANIME_A]
    )

    const report = await promote({ source, target, log: () => {} })
    const anime = report.tables.find((t) => t.table === 'anime')

    expect(anime?.updated).toBe(1)
    expect(anime?.unchanged).toBe(1)
    expect(
      await count('SELECT count(*)::int AS count FROM anime WHERE title = $1', [
        'Test Anime A v2',
      ])
    ).toBe(1)
  })

  test('dryRun valida sin escribir', async () => {
    await source.query(
      `INSERT INTO anime (mal_id, title) VALUES (990003, 'Test Dry Run')
       ON CONFLICT (mal_id) DO NOTHING`
    )

    const before = await count('SELECT count(*)::int AS count FROM anime')
    await promote({ source, target, dryRun: true, log: () => {} })
    const after = await count('SELECT count(*)::int AS count FROM anime')

    expect(after).toBe(before)

    await source.query('DELETE FROM anime WHERE mal_id = 990003')
  })
})
