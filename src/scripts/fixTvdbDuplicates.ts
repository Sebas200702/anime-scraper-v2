/**
 * Limpia los ids de TVDB compartidos por varios animes.
 *
 * El buscador de TVDB devuelve el primer candidato y a veces ese mismo id
 * encaja con varios de nuestros animes (títulos repetidos, franchises, y
 * series que aún no tienen id de MAL). Con un id compartido, los artworks
 * (banner, clearlogo…) podrían ser de otra serie: es peor que no tenerlos.
 *
 * Para cada id compartido se consulta la serie y se **conserva** solo en el
 * anime cuyo título normalizado coincide con el nombre (o un alias) de la
 * serie; el resto se queda sin id.
 *
 * Uso: bun run tvdb:fix-duplicates
 */
import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { authenticate } from '../libs/tvdb.js'

const norm = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, '')

const main = async () => {
  const token = await authenticate()

  const groups = (
    await db.execute(`
      SELECT tvdb_id, array_agg(anime_id ORDER BY anime_id) AS anime_ids
      FROM anime_external_ids
      WHERE tvdb_id IS NOT NULL
      GROUP BY tvdb_id
      HAVING count(*) > 1
    `)
  ).rows as unknown as { tvdb_id: number; anime_ids: number[] }[]

  console.log(`ids de TVDB compartidos: ${groups.length}`)

  const titles = new Map<number, string[]>()
  for (const group of groups) {
    const rows = (
      await db.execute(
        `SELECT mal_id, title, title_english FROM anime WHERE mal_id = ANY(ARRAY[${group.anime_ids.join(', ')}]::int[])`
      )
    ).rows as unknown as {
      mal_id: number
      title: string
      title_english: string | null
    }[]
    titles.set(
      group.tvdb_id,
      rows.map((r) => r.title)
    )
  }

  let cleared = 0
  let kept = 0
  for (const group of groups) {
    const res = await fetch(
      `https://api4.thetvdb.com/v4/series/${group.tvdb_id}/extended`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      }
    )
    const json = (await res.json().catch(() => ({}))) as {
      data?: { name?: string; aliases?: string[] }
    }
    // En TVDB v4 `aliases` puede venir como cadenas o como objetos { name }.
    const rawNames = [json.data?.name ?? '', ...(json.data?.aliases ?? [])].map(
      (a) => (typeof a === 'string' ? a : ((a as { name?: string })?.name ?? ''))
    )
    const names = rawNames.map(norm).filter((n) => n.length >= 3)

    // ¿Qué animes encajan con el nombre de la serie?
    const fits = group.anime_ids.filter((animeId) => {
      const candidates = titles.get(group.tvdb_id) ?? []
      const title = candidates[group.anime_ids.indexOf(animeId)] ?? ''
      const key = norm(title)
      return names.some(
        (n) => n === key || (n.includes(key) && key.length >= 5)
      )
    })

    if (fits.length === 1) {
      const drop = group.anime_ids.filter((id) => id !== fits[0])
      await db.execute(sql`
        UPDATE anime_external_ids
        SET tvdb_id = NULL, updated_at = now()
        WHERE anime_id = ANY(ARRAY[${sql.raw(drop.join(', '))}]::int[])
      `)
      cleared += drop.length
      kept += 1
    } else {
      await db.execute(sql`
        UPDATE anime_external_ids
        SET tvdb_id = NULL, updated_at = now()
        WHERE anime_id = ANY(ARRAY[${sql.raw(group.anime_ids.join(', '))}]::int[])
      `)
      cleared += group.anime_ids.length
    }
  }

  const total = (
    await db.execute(
      'SELECT count(*)::int AS n FROM anime_external_ids WHERE tvdb_id IS NOT NULL'
    )
  ).rows[0] as unknown as { n: number }
  console.log(
    `✓ ${cleared} ids dudosos limpiados · ${kept} grupos conservados · total con tvdb_id: ${total.n}`
  )
  process.exit(0)
}

await main()
