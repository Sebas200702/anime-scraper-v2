/**
 * Relaciona los artistas de música con las personas de MAL (`staff`).
 *
 * Los artistas llegan de AnimeThemes (que publica el **nombre** del intérprete)
 * y de ANN; solo los que tienen ficha de artista en AnimeThemes traen su id de
 * MAL. Para el resto se busca la persona en `staff` por **nombre normalizado**
 * (sin acentos, sin paréntesis, sin "feat.", sin puntuación ni espacios).
 *
 * Reglas:
 * - si el nombre normalizado corresponde a **una sola** persona de `staff`, se
 *   asigna su `mal_id` (la FK de `artist.mal_id` lo exige);
 * - si corresponde a varias, se descarta: dos personas homónimas NO son la misma.
 *
 * Uso: bun run artists:match-staff
 */
import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'

/** Nombre normalizado para comparar entre fuentes. */
export const normalizeArtistName = (
  value: string | null | undefined
): string => {
  if (!value) return ''
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/feat\.?.*$/i, ' ')
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, '')
    .trim()
}

const main = async () => {
  const staff = (await db.execute('SELECT mal_id, name FROM staff'))
    .rows as unknown as { mal_id: number; name: string }[]

  const byName = new Map<string, number[]>()
  for (const person of staff) {
    const key = normalizeArtistName(person.name)
    if (!key) continue
    const ids = byName.get(key) ?? []
    ids.push(person.mal_id)
    byName.set(key, ids)
  }

  const artists = (
    await db.execute(
      'SELECT id, name FROM artist WHERE mal_id IS NULL ORDER BY id'
    )
  ).rows as unknown as { id: number; name: string }[]

  const updates: { id: number; malId: number }[] = []
  let ambiguous = 0
  for (const artist of artists) {
    const key = normalizeArtistName(artist.name)
    if (!key) continue
    const hits = byName.get(key) ?? []
    if (hits.length === 1 && hits[0] !== undefined) {
      updates.push({ id: artist.id, malId: hits[0] })
    }
    else if (hits.length > 1) ambiguous++
  }

  let touched = 0
  for (let i = 0; i < updates.length; i += 1000) {
    const batch = updates.slice(i, i + 1000)
    const res = await db.execute(sql`
      UPDATE artist a
      SET mal_id = v.mal_id
      FROM (VALUES ${sql.join(
        batch.map((u) => sql`(${u.id}::int, ${u.malId}::int)`),
        sql`, `
      )}) AS v(artist_id, mal_id)
      WHERE a.id = v.artist_id AND a.mal_id IS NULL
    `)
    touched += res.rowCount ?? 0
  }

  const total = await db.execute(
    'SELECT count(*)::int AS n FROM artist WHERE mal_id IS NOT NULL'
  )
  console.log(
    `✓ ${touched} artistas relacionados con su persona de MAL ` +
      `(${ambiguous} descartados por homonimia) · ` +
      `total con mal_id: ${(total.rows[0] as { n: number }).n}`
  )
  process.exit(0)
}

await main()
