/**
 * Mejora el mapeo MAL → AniList por **año + título normalizado**.
 *
 * El bulk por año que ya hacíamos se cruzaba solo por `idMal`: cuando AniList
 * tiene la entrada pero su `idMal` viene vacío (muchos cortos chinos/coreanos),
 * el anime se quedaba sin link. Con los listados completos por año se puede
 * emparejar por título, que en la práctica es único dentro de un mismo año.
 *
 * Reglas (estrictas a propósito):
 * - el candidato debe estar en **el mismo año** de emisión,
 * - el título normalizado (romaji/inglés/nativo) debe coincidir **exactamente**,
 * - si el candidato ya tiene un `idMal` que no es el nuestro, se descarta (es
 *   otro anime),
 * - si hay varios candidatos, se descarta (ambiguo).
 *
 * Uso: bun run anilist:seed-ids
 */
import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { fetcher } from '../libs/fetcher.js'

/** AniList: 30 req/min por IP. El `fetcher` reintenta con `Retry-After`. */
let lastCall = 0
const throttle = async () => {
  const wait = 2100 - (Date.now() - lastCall)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCall = Date.now()
}

const norm = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, '')

interface Media {
  id: number
  idMal: number | null
  title: {
    romaji: string | null
    english: string | null
    native: string | null
  }
  startDate: { year: number | null } | null
  format: string | null
}

const QUERY = `query ($year: Int, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    media(type: ANIME, seasonYear: $year, sort: ID) {
      id
      idMal
      title { romaji english native }
      startDate { year }
      format
    }
  }
}`

const fetchYear = async (year: number): Promise<Media[]> => {
  const out: Media[] = []
  let page = 1
  for (;;) {
    await throttle()
    const json = (await fetcher<{
      data?: {
        Page?: {
          pageInfo?: { hasNextPage: boolean }
          media?: Media[]
        }
      }
      errors?: { message: string }[]
    }>({
      url: 'https://graphql.anilist.co',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: QUERY,
        variables: { year, page },
      }),
      timeoutMs: 25_000,
    })) as {
      data?: {
        Page?: {
          pageInfo?: { hasNextPage: boolean }
          media?: Media[]
        }
      }
      errors?: { message: string }[]
    }
    if (json.errors?.length) {
      throw new Error(`AniList: ${json.errors[0]?.message}`)
    }
    const pageData = json.data?.Page
    out.push(...(pageData?.media ?? []))
    if (!pageData?.pageInfo?.hasNextPage) break
    page++
  }
  return out
}

const main = async () => {
  const ours = (
    await db.execute(`
      SELECT a.mal_id, a.title, a.title_english, a.year, a.type
      FROM anime a
      LEFT JOIN anime_external_ids x ON x.anime_id = a.mal_id
      WHERE x.anilist_id IS NULL
      ORDER BY a.mal_id
    `)
  ).rows as unknown as {
    mal_id: number
    title: string
    title_english: string | null
    year: number | null
    type: string | null
  }[]

  console.log(`animes sin id de AniList: ${ours.length}`)

  // Por año: los candidatos de AniList de ese año, indexados por título.
  const byYear = new Map<
    number,
    Map<string, { media: Media; conflict: boolean }[]>
  >()

  const thisYear = new Date().getUTCFullYear()
  for (let year = 1940; year <= thisYear; year++) {
    let medias: Media[] = []
    try {
      medias = await fetchYear(year)
    } catch (error) {
      console.warn(`  · ${year}: ${(error as Error).message}`)
      continue
    }
    const index = new Map<string, { media: Media; conflict: boolean }[]>()
    for (const media of medias) {
      const keys = new Set(
        [media.title.romaji, media.title.english, media.title.native]
          .map(norm)
          .filter((k) => k.length >= 3)
      )
      for (const key of keys) {
        const list = index.get(key) ?? []
        const existing = list.find((e) => e.media.id === media.id)
        if (existing) continue
        list.push({ media, conflict: false })
        index.set(key, list)
      }
    }
    byYear.set(year, index)
    if (year % 20 === 0) console.log(`  … ${year} (${medias.length} entradas)`)
  }

  const pairs: { animeId: number; anilistId: number }[] = []
  let ambiguous = 0
  for (const anime of ours) {
    if (!anime.year) continue
    const index = byYear.get(anime.year)
    if (!index) continue
    const keys = new Set(
      [anime.title, anime.title_english].map(norm).filter((k) => k.length >= 3)
    )
    const candidates = new Map<number, Media>()
    for (const key of keys) {
      for (const entry of index.get(key) ?? []) {
        candidates.set(entry.media.id, entry.media)
      }
    }
    if (candidates.size === 0) continue
    if (candidates.size > 1) {
      ambiguous++
      continue
    }
    const media = [...candidates.values()][0]
    if (!media) continue
    // Si AniList dice que es otro anime de MAL, no es el nuestro.
    if (media.idMal !== null && media.idMal !== anime.mal_id) continue
    // El tipo debe cuadrar (una película no es una serie).
    if (anime.type === 'Movie' && media.format !== 'MOVIE') continue
    if (anime.type !== 'Movie' && media.format === 'MOVIE') continue
    pairs.push({ animeId: anime.mal_id, anilistId: media.id })
  }

  for (let i = 0; i < pairs.length; i += 1000) {
    const batch = pairs.slice(i, i + 1000)
    await db.execute(sql`
      INSERT INTO anime_external_ids (anime_id, anilist_id, created_at, updated_at)
      SELECT v.anime_id, v.anilist_id, now(), now()
      FROM (VALUES ${sql.join(
        batch.map((p) => sql`(${p.animeId}::int, ${p.anilistId}::int)`),
        sql`, `
      )}) AS v(anime_id, anilist_id)
      ON CONFLICT (anime_id) DO UPDATE
      SET anilist_id = excluded.anilist_id, updated_at = now()
    `)
  }

  const total = (
    await db.execute(
      'SELECT count(*)::int AS n FROM anime_external_ids WHERE anilist_id IS NOT NULL'
    )
  ).rows[0] as unknown as { n: number }
  console.log(
    `✓ ${pairs.length} ids de AniList nuevos · ${ambiguous} ambiguos · total con anilist_id: ${total.n}`
  )
  process.exit(0)
}

await main()
