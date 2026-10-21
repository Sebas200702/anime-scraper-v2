/**
 * Limpia los `kitsu_id` compartidos por varios animes.
 *
 * El cruce inverso de Kitsu (el que da el mapping exacto) dejó 11.270 animes
 * apuntando al mismo id de Kitsu: el id existe, pero es de otra serie (p.
 * ej. una OVA y su serie madre comparten entrada en Kitsu). Con ese id la app
 * puede mostrar los episodios de otra obra.
 *
 * La regla: si un id de Kitsu lo Several animes, se **conserva solo en el
 * anime cuyo título normalizado coincide con el título de Kitsu** (traducido
 * y original); el resto se queda sin id, que es mejor que un id equivocado.
 *
 * Uso: bun run kitsu:fix-duplicates
 */
import { sql } from 'drizzle-orm'
import fs from 'node:fs'
import { db } from '../libs/db.js'

/** El pool de proxies: Kitsu no responde a IPs de datacenter. */
const proxies: string[] = JSON.parse(
  fs.readFileSync(new URL('../../proxies.json', import.meta.url), 'utf8')
)
let proxyIndex = 0

/** Normaliza un título para comparar: sin acentos, sin puntuación ni espacios. */
const normalize = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, '')

interface KitsuAnime {
  id: number
  titles?: {
    en?: string | null
    en_jp?: string | null
    ja_jp?: string | null
    en_us?: string | null
    en_uk?: string | null
  }
  attributes?: { titles?: Record<string, string> }
}

const main = async () => {
  const groups = (
    await db.execute(sql`
      SELECT kitsu_id, array_agg(anime_id ORDER BY anime_id) AS anime_ids
      FROM anime_external_ids
      WHERE kitsu_id IS NOT NULL
      GROUP BY kitsu_id
      HAVING count(*) > 1
    `)
  ).rows as unknown as { kitsu_id: number; anime_ids: number[] }[]

  console.log(`ids de Kitsu compartidos: ${groups.length}`)

  const allIds = [...new Set(groups.flatMap((g) => g.anime_ids))]
  const animeRows = allIds.length
    ? (
        await db.execute(sql`
          SELECT mal_id, title, title_english, title_japanese
          FROM anime
          WHERE mal_id IN (${sql.raw(allIds.join(', '))})
        `)
      ).rows
    : []
  const animeTyped = animeRows as unknown as {
    mal_id: number
    title: string
    title_english: string | null
    title_japanese: string | null
  }[]
  const byId = new Map(animeTyped.map((r) => [r.mal_id, r]))

  // Las fichas de Kitsu se piden en paralelo (una por id compartido).
  const titleSets = new Map<number, string[]>()
  const CONCURRENCY = 8
  for (let i = 0; i < groups.length; i += CONCURRENCY) {
    const slice = groups.slice(i, i + CONCURRENCY)
    await Promise.all(
      slice.map(async (group) => {
        let titles: string[] = []
        try {
          const proxy = proxies[proxyIndex++ % proxies.length]
          const res = await fetch(
            `https://kitsu.io/api/edge/anime/${group.kitsu_id}`,
            {
              headers: { Accept: 'application/vnd.api+json' },
              proxy: `http://${proxy}`,
              signal: AbortSignal.timeout(25_000),
            }
          )
          if (res.ok) {
            const json = (await res.json()) as { data?: KitsuAnime }
            const t = json.data?.titles ?? {}
            titles = [t.en, t.en_jp, t.ja_jp, t.en_us, t.en_uk].filter(
              (v): v is string => typeof v === 'string'
            )
          }
        } catch {
          // Sin la ficha de Kitsu no se puede decidir: se descarta el id
          // entero (preferimos no tenerlo a tenerlo equivocado).
        }
        titleSets.set(group.kitsu_id, titles)
      })
    )
  }

  let cleared = 0
  let kept = 0
  for (const group of groups) {
    const titles = titleSets.get(group.kitsu_id) ?? []

    const keys = titles.map(normalize).filter((k) => k.length >= 3)
    const fits = group.anime_ids.filter((animeId) => {
      const row = byId.get(animeId)
      if (!row) return false
      const candidates = [row.title, row.title_english, row.title_japanese]
        .map(normalize)
        .filter((k) => k.length >= 3)
      return candidates.some((c) =>
        keys.some((k) => k === c || k.includes(c) || c.includes(k))
      )
    })

    if (fits.length === 1) {
      const drop = group.anime_ids.filter((id) => id !== fits[0])
      await db.execute(sql`
        UPDATE anime_external_ids
        SET kitsu_id = NULL, updated_at = now()
        WHERE anime_id = ANY(ARRAY[${sql.raw(drop.join(', '))}]::int[])
      `)
      cleared += drop.length
      kept += 1
    } else {
      await db.execute(sql`
        UPDATE anime_external_ids
        SET kitsu_id = NULL, updated_at = now()
        WHERE anime_id = ANY(ARRAY[${sql.raw(group.anime_ids.join(', '))}]::int[])
      `)
      cleared += group.anime_ids.length
    }
  }

  const total = (
    await db.execute(
      'SELECT count(*)::int AS n FROM anime_external_ids WHERE kitsu_id IS NOT NULL'
    )
  ).rows[0] as unknown as { n: number }
  console.log(
    `✓ ${cleared} ids dudosos limpiados · ${kept} grupos conservados · total con kitsu_id: ${total.n}`
  )
  process.exit(0)
}

await main()
