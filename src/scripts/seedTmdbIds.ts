/**
 * Mapea MAL → TMDB.
 *
 * Dos vías, ambas verificables:
 * 1. **`remote_ids` de TVDB**: si la serie de TVDB tiene el id de TMDB
 *    (tipo 12, "TheMovieDB.com"), el mapeo es **exacto** y gratis. Cubrimos
 *    7.031 animes con id de TVDB.
 * 2. **Búsqueda de TMDB** por título (+año) para el resto, con verificación
 *    estricta: el título normalizado debe coincidir y el año ser el mismo o
 *    ±1. Si hay varios candidatos válidos, se descarta (ambiguo).
 *
 * Uso: bun run tmdb:seed-ids
 */
import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { authenticate } from '../libs/tvdb.js'
import { hasTmdbKey, searchTmdbSeries } from '../services/tmdb.js'

/** Normaliza títulos para comparar entre MAL y TMDB. */
const norm = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, '')

const main = async () => {
  // 1) Vía exacta: el id de TMDB dentro de los remote_ids de TVDB.
  const token = await authenticate()
  const withTvdb = (
    await db.execute(
      `SELECT anime_id, tvdb_id FROM anime_external_ids WHERE tvdb_id IS NOT NULL ORDER BY anime_id`
    )
  ).rows as unknown as { anime_id: number; tvdb_id: number }[]

  let fromTvdb = 0
  for (let i = 0; i < withTvdb.length; i += 8) {
    const batch = withTvdb.slice(i, i + 8)
    const results = await Promise.all(
      batch.map(async (row) => {
        try {
          const response = await fetch(
            `https://api4.thetvdb.com/v4/series/${row.tvdb_id}/extended`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(20_000),
            }
          )
          const json = (await response.json()) as {
            data?: {
              remoteIds?: { sourceName?: string; id?: string | number }[]
            }
          }
          const tmdb = (json.data?.remoteIds ?? []).find(
            (r) =>
              /themoviedb/i.test(r.sourceName ?? '') &&
              Number.isFinite(Number(r.id))
          )
          return tmdb
            ? { animeId: row.anime_id, tmdbId: Number(tmdb.id) }
            : null
        } catch {
          return null
        }
      })
    )
    const pairs = results.filter(
      (r): r is { animeId: number; tmdbId: number } => r !== null
    )
    if (pairs.length > 0) {
      await db.execute(sql`
        INSERT INTO anime_external_ids (anime_id, tmdb_id, created_at, updated_at)
        SELECT v.anime_id, v.tmdb_id, now(), now()
        FROM (VALUES ${sql.join(
          pairs.map((p) => sql`(${p.animeId}::int, ${p.tmdbId}::int)`),
          sql`, `
        )}) AS v(anime_id, tmdb_id)
        ON CONFLICT (anime_id) DO UPDATE
        SET tmdb_id = excluded.tmdb_id, updated_at = now()
      `)
      fromTvdb += pairs.length
    }
    if ((i + 1) % 500 === 0)
      console.log(`  … ${i + 1}/${withTvdb.length} (tvdb → tmdb)`)
  }
  console.log(`✓ ${fromTvdb} ids de TMDB sacados de los remote_ids de TVDB`)

  // 2) Búsqueda para el resto (si hay key).
  if (!hasTmdbKey()) {
    console.log(
      '· sin TMDB_API_KEY: la búsqueda por título queda pendiente (pon la key en .env y reejecuta)'
    )
    process.exit(0)
  }

  const pending = (
    await db.execute(`
      SELECT a.mal_id, a.title, a.title_english, a.year
      FROM anime a
      LEFT JOIN anime_external_ids x ON x.anime_id = a.mal_id
      WHERE x.tmdb_id IS NULL
      ORDER BY a.mal_id
    `)
  ).rows as unknown as {
    mal_id: number
    title: string
    title_english: string | null
    year: number | null
  }[]

  console.log(`buscando id de TMDB para ${pending.length} animes…`)
  let found = 0
  let ambiguous = 0
  const pairs: { animeId: number; tmdbId: number }[] = []

  for (let i = 0; i < pending.length; i++) {
    const row = pending[i]
    if (!row) continue
    try {
      const candidates = await searchTmdbSeries(
        row.title_english || row.title,
        row.year
      )
      const target = norm(row.title_english || row.title)
      const valid = candidates.filter((c) => {
        if (!row.year || !c.firstAirDate) return norm(c.name) === target
        const year = Number(c.firstAirDate.slice(0, 4))
        return Math.abs(year - row.year) <= 1 && norm(c.name) === target
      })
      const unique = new Set(valid.map((c) => c.id))
      if (unique.size === 1) {
        pairs.push({ animeId: row.mal_id, tmdbId: [...unique][0] as number })
        found++
      } else if (unique.size > 1) {
        ambiguous++
      }
    } catch {
      // sin key o error: se sigue
    }
    if ((i + 1) % 500 === 0) {
      console.log(
        `  … ${i + 1}/${pending.length} · ${found} con id · ${ambiguous} ambiguos`
      )
    }
  }

  for (let i = 0; i < pairs.length; i += 1000) {
    const batch = pairs.slice(i, i + 1000)
    await db.execute(sql`
      INSERT INTO anime_external_ids (anime_id, tmdb_id, created_at, updated_at)
      SELECT v.anime_id, v.tmdb_id, now(), now()
      FROM (VALUES ${sql.join(
        batch.map((p) => sql`(${p.animeId}::int, ${p.tmdbId}::int)`),
        sql`, `
      )}) AS v(anime_id, tmdb_id)
      ON CONFLICT (anime_id) DO UPDATE
      SET tmdb_id = excluded.tmdb_id, updated_at = now()
    `)
  }

  const total = (
    await db.execute(
      'SELECT count(*)::int AS n FROM anime_external_ids WHERE tmdb_id IS NOT NULL'
    )
  ).rows[0] as unknown as { n: number }
  console.log(
    `✓ ${found} ids por búsqueda · ${ambiguous} ambiguos · total con tmdb_id: ${total.n}`
  )
  process.exit(0)
}

await main()
