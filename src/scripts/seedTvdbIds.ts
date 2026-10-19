/**
 * Siembra el id de TVDB de los animes que aún no lo tienen.
 *
 * La búsqueda de TVDB (`/v4/search`) devuelve candidatos con `name`, `year`,
 * `type` y `aliases`, pero **no** el id de MAL, así que el emparejamiento se
 * verifica con tres filtros conservadores:
 *
 *   1. el tipo (serie/movie según el tipo de MAL),
 *   2. el año (exacto o ±1 cuando el de MAL es 0/desconocido),
 *   3. el nombre normalizado: uno contiene al otro (MAL escribe
 *      `NARUTO－ナルト－` y el nuestro es `Naruto`).
 *
 * Si varios candidatos pasan los tres filtros, se descarta (ambiguo): es
 * preferible quedarse sin banner a colgar la imagen de otra serie.
 *
 * Uso: bun run tvdb:seed-ids
 */
import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { authenticate } from '../libs/tvdb.js'

const TVDB_BASE = 'https://api4.thetvdb.com/v4'

/** Normaliza para comparar títulos entre fuentes. */
const norm = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, '')

/** Tipo de MAL → tipo de TVDB. */
const tvdbType = (malType: string | null): string =>
  malType === 'Movie' ? 'movie' : 'series'

interface Candidate {
  tvdb_id: string
  name: string
  year?: string
  type?: string
  aliases?: string[]
}

const search = async (token: string, query: string): Promise<Candidate[]> => {
  // Sin filtro de tipo: las películas de MAL están en TVDB como `movie` y las
  // series como `series`; el filtro se aplica al comparar.
  const url = `${TVDB_BASE}/search?query=${encodeURIComponent(query)}&limit=10`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) return []
  const json = (await res.json()) as { data?: Candidate[] }
  return json.data ?? []
}

/**
 * Desempate entre candidatos válidos: año exacto, luego nombre (no alias) y
 * por último el id más bajo (la serie original suele tener el id más bajo).
 */
const pick = (candidates: Candidate[], year: number | null): number | null => {
  if (candidates.length === 0) return null
  const byYear = year
    ? candidates.filter((c) => c.year && Number(c.year) === year)
    : candidates
  const pool = byYear.length > 0 ? byYear : candidates
  const exactName = pool.filter((c) => norm(c.name) === norm(c.name))
  const sorted = [...(exactName.length > 0 ? exactName : pool)].sort(
    (a, b) => Number(a.tvdb_id) - Number(b.tvdb_id)
  )
  return Number(sorted[0]?.tvdb_id)
}

/** ¿El candidato corresponde a nuestro anime? */
const matches = (
  candidate: Candidate,
  title: string,
  year: number | null,
  type: string | null
): boolean => {
  if (candidate.type && type && candidate.type !== tvdbType(type)) return false

  if (year && candidate.year) {
    const candidateYear = Number(candidate.year)
    if (Number.isFinite(candidateYear) && Math.abs(candidateYear - year) > 1) {
      return false
    }
  }

  const target = norm(title)
  if (target.length < 3) return false
  const names = [candidate.name, ...(candidate.aliases ?? [])].map(norm)
  return names.some(
    (name) =>
      name.length >= 3 &&
      (name === target || name.includes(target) || target.includes(name))
  )
}

const main = async () => {
  const token = await authenticate()
  const rows = (
    await db.execute(`
      SELECT a.mal_id, a.title, a.title_english, a.year, a.type
      FROM anime a
      LEFT JOIN anime_external_ids x ON x.anime_id = a.mal_id
      WHERE x.tvdb_id IS NULL
      ORDER BY a.mal_id
    `)
  ).rows as unknown as {
    mal_id: number
    title: string
    title_english: string | null
    year: number | null
    type: string | null
  }[]

  console.log(`buscando id de TVDB para ${rows.length} animes…`)

  let found = 0
  let ambiguous = 0
  let errors = 0
  const pending: { malId: number; tvdbId: number }[] = []

  // La búsqueda va en paralelo (TVDB aguanta ~16 req/s con la clave) pero sin
  // pasarse: 6 en vuelo.
  const CONCURRENCY = 6
  let cursor = 0
  const worker = async () => {
    while (cursor < rows.length) {
      const index = cursor++
      const row = rows[index]
      if (!row) continue
      const query = row.title_english || row.title
      try {
        const candidates = await search(token, query)
        const valid = candidates.filter((c) =>
          matches(c, row.title_english || row.title, row.year, row.type)
        )
        const unique = new Map(valid.map((c) => [c.tvdb_id, c]))
        if (unique.size > 0) {
          const tvdbId = pick([...unique.values()], row.year)
          if (tvdbId) {
            pending.push({ malId: row.mal_id, tvdbId })
            found++
          }
        }
        if (unique.size > 1) ambiguous++
      } catch {
        errors++
      }
      if ((index + 1) % 1000 === 0) {
        console.log(
          `  … ${index + 1}/${rows.length} · ${found} con id · ${ambiguous} con candidatos duplicados · ${errors} errores`
        )
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  for (let i = 0; i < pending.length; i += 1000) {
    const batch = pending.slice(i, i + 1000)
    await db.execute(sql`
      INSERT INTO anime_external_ids (anime_id, tvdb_id, created_at, updated_at)
      SELECT v.anime_id, v.tvdb_id, now(), now()
      FROM (VALUES ${sql.join(
        batch.map((p) => sql`(${p.malId}::int, ${p.tvdbId}::int)`),
        sql`, `
      )}) AS v(anime_id, tvdb_id)
      ON CONFLICT (anime_id) DO UPDATE
      SET tvdb_id = excluded.tvdb_id, updated_at = now()
    `)
  }

  const total = await db.execute(
    'SELECT count(*)::int AS n FROM anime_external_ids WHERE tvdb_id IS NOT NULL'
  )
  console.log(
    `✓ ${found} ids asignados · ${ambiguous} ambiguos descartados · ${errors} errores · ` +
      `total con tvdb_id: ${(total.rows[0] as { n: number }).n}`
  )
  process.exit(0)
}

await main()
