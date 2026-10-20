/**
 * Enumeración completa del catálogo de AniList (anime + manga + novelas).
 *
 * Por qué no vale el `Page` de AniList: el límite de profundidad de la API es
 * de **5.000 entradas** por consulta, así que `Page` solo llega a la 100 y no
 * cubre el espacio de ids (218.626). La vía que sí lo cubre es `id_in`:
 * se piden 50 ids por consulta y se avanza por el espacio.
 *
 * Qué resuelve:
 *  1. **Mapeo MAL → AniList exacto**: se enlaza por `idMal` (no por título),
 *     lo que cierra el hueco de los ~9.600 animes sin `anilist_id`.
 *  2. **Catálogo de manga/novela**: se crea la fila en `manga` para cada
 *     medio impreso con id de MAL, con sus sinónimos, géneros y taxonomic.
 *
 * No es un *source* del servicio sino un script de una pasada: el pool de
 * proxies se usa entero (100 IPs × 30 req/min = ~50 req/s).
 *
 * Uso: bun run anilist:enumerate [-- --from=1 --to=218700 --block=50]
 */
import { sql } from 'drizzle-orm'
import fs from 'node:fs'
import { db } from '../libs/db.js'
import { anime } from '../schemas/anime.js'
import { animeExternalIds } from '../schemas/animeExternal.js'
import { animeTitleSynonym } from '../schemas/anime.js'
import { manga } from '../schemas/manga.js'
import { mangaExternalIds } from '../schemas/mangaExternal.js'
import { mangaTitleSynonym } from '../schemas/manga.js'

const CONFIG = {
  from: 1,
  to: 218_700,
  block: 50,
  /** AniList: 30 req/min por IP. */
  delayMs: 2_150,
  workers: 100,
}

/** Campos del Media que nos interesan (sin personajes: van en el pase profundo). */
const MEDIA_QUERY = `query ($ids: [Int]) {
  Page(page: 1, perPage: 50) {
    media(id_in: $ids, sort: ID) {
      id
      idMal
      type
      format
      status
      episodes
      chapters
      volumes
      countryOfOrigin
      source
      startDate { year month day }
      endDate { year month day }
      season
      seasonYear
      popularity
      favourites
      averageScore
      meanScore
      isAdult
      title { romaji english native }
      synonyms
      description(asHtml: false)
      genres
      tags { id name rank category }
      coverImage { extraLarge large color }
      bannerImage
      trailer { id site }
      externalLinks { id site url type }
    }
  }
}`

interface AniListMedia {
  id: number
  idMal: number | null
  type: string
  format: string | null
  status: string | null
  episodes: number | null
  chapters: number | null
  volumes: number | null
  countryOfOrigin: string | null
  source: string | null
  startDate: {
    year: number | null
    month: number | null
    day: number | null
  } | null
  endDate: {
    year: number | null
    month: number | null
    day: number | null
  } | null
  season: string | null
  seasonYear: number | null
  popularity: number | null
  favourites: number | null
  averageScore: number | null
  meanScore: number | null
  isAdult: boolean
  title: {
    romaji: string | null
    english: string | null
    native: string | null
  }
  synonyms: string[]
  description: string | null
  genres: string[]
  tags: { id: number; name: string; rank: number; category: string }[]
  coverImage: {
    extraLarge: string | null
    large: string | null
    color: string | null
  } | null
  bannerImage: string | null
  trailer: { id: string | null; site: string | null } | null
  externalLinks: {
    id: number
    site: string
    url: string
    type: string | null
  }[]
}

const proxies: string[] = JSON.parse(
  fs.readFileSync(new URL('../../proxies.json', import.meta.url), 'utf8')
)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Deduplica por clave: un ON CONFLICT no puede tocar dos veces la misma fila. */
const dedupeBy = <T>(items: T[], key: (item: T) => string | number): T[] => {
  const seen = new Map<string | number, T>()
  for (const item of items) {
    const k = key(item)
    if (!seen.has(k)) seen.set(k, item)
  }
  return [...seen.values()]
}

/** Trocea en lotes: Postgres admite 65.535 parámetros por sentencia. */
const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

/** Estado compartido de los workers. */
const stats = {
  requests: 0,
  media: 0,
  animeLinked: 0,
  animeMissing: 0,
  mangaRows: 0,
  mangaNoMal: 0,
  errors: 0,
  retries: 0,
}

/** Petición GraphQL con reintentos y espera por IP. */
const fetchBlock = async (
  ids: number[],
  proxy: string,
  nextAt: { value: number }
): Promise<AniListMedia[]> => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const wait = nextAt.value - Date.now()
    if (wait > 0) await sleep(wait)
    nextAt.value = Date.now() + CONFIG.delayMs

    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: MEDIA_QUERY, variables: { ids } }),
        proxy: `http://${proxy}`,
        signal: AbortSignal.timeout(40_000),
      })

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') ?? 60)
        stats.retries++
        await sleep(Math.min(retryAfter, 70) * 1_000)
        continue
      }
      if (!res.ok) {
        await sleep(1_000 * attempt)
        continue
      }

      const json = (await res.json()) as {
        data?: { Page?: { media?: AniListMedia[] } }
        errors?: { message: string }[]
      }
      if (json.errors?.length) {
        await sleep(1_000 * attempt)
        continue
      }
      stats.requests++
      return json.data?.Page?.media ?? []
    } catch {
      stats.errors++
      await sleep(800 * attempt)
    }
  }
  return []
}

/**
 * Fecha ISO (yyyy-mm-dd) a partir de las partes de AniList.
 * AniList tiene fechas imposibles ("2016-06-31"): se validan y se descartan
 * (Postgres las rechaza con `date/time field value out of range`).
 */
const isoDate = (
  d: { year: number | null; month: number | null; day: number | null } | null
): string | null => {
  if (!d?.year) return null
  const year = d.year
  const month = d.month ?? 1
  const day = d.day ?? 1
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  // Comprobación de ida y vuelta: detecta el 31 de junio y compañía.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Tipo de medio impreso según el `format` de AniList. */
const mediaType = (format: string | null): string => {
  switch (format) {
    case 'NOVEL':
      return 'novel'
    case 'ONE_SHOT':
      return 'one_shot'
    case 'DOUJIN':
      return 'doujin'
    case 'MANHWA':
      return 'manhwa'
    case 'MANHUA':
      return 'manhua'
    default:
      return 'manga'
  }
}

const main = async () => {
  const args = process.argv.slice(2)
  for (const arg of args) {
    const [key, value] = arg.replace(/^--/, '').split('=')
    if (key === 'from') CONFIG.from = Number(value)
    if (key === 'to') CONFIG.to = Number(value)
    if (key === 'block') CONFIG.block = Number(value)
    if (key === 'workers') CONFIG.workers = Number(value)
  }

  console.log(
    `▸ Recorriendo ids ${CONFIG.from}..${CONFIG.to} en bloques de ${CONFIG.block} con ${CONFIG.workers} workers`
  )

  const blocks: number[][] = []
  for (let start = CONFIG.from; start <= CONFIG.to; start += CONFIG.block) {
    blocks.push(
      Array.from(
        { length: Math.min(CONFIG.block, CONFIG.to - start + 1) },
        (_, i) => start + i
      )
    )
  }

  // Buffers de escritura (se vacían por lote para no castigar la DB).
  const animeLinks: { animeId: number; anilistId: number }[] = []
  const animeUpdates: {
    malId: number
    bannerImage: string | null
    trailerId: string | null
    source: string | null
    averageScore: number | null
    favorites: number | null
    popularityRank: number | null
    startDate: string | null
    endDate: string | null
    isAdult: boolean
  }[] = []
  const mangaExternal: { mangaId: number; anilistId: number }[] = []
  const mangaRows: {
    malId: number
    type: string
    title: string
    titleEnglish: string | null
    titleJapanese: string | null
    status: string | null
    chapters: number | null
    volumes: number | null
    score: number | null
    scoredBy: number | null
    popularityRank: number | null
    members: number | null
    favorites: number | null
    year: number | null
    synopsis: string | null
    source: string | null
    countryOfOrigin: string | null
    publishedFrom: string | null
    publishedTo: string | null
    anilistId: number
    anilistSiteId: string | null
    coverLarge: string | null
    coverExtraLarge: string | null
    banner: string | null
    synonyms: string[]
  }[] = []

  const flush = async () => {
    for (const batch of chunk(
      dedupeBy(animeLinks.splice(0), (l) => l.animeId),
      2_000
    )) {
      await db.execute(sql`
        INSERT INTO anime_external_ids (anime_id, anilist_id, created_at, updated_at)
        SELECT v.anime_id, v.anilist_id, now(), now()
        FROM (VALUES ${sql.join(
          batch.map((l) => sql`(${l.animeId}::int, ${l.anilistId}::int)`),
          sql`, `
        )}) AS v(anime_id, anilist_id)
        ON CONFLICT (anime_id) DO UPDATE
          SET anilist_id = EXCLUDED.anilist_id, updated_at = now()
        WHERE anime_external_ids.anilist_id IS DISTINCT FROM EXCLUDED.anilist_id
      `)
    }

    for (const batch of chunk(
      dedupeBy(animeUpdates.splice(0), (u) => u.malId),
      1_000
    )) {
      await db.execute(sql`
        UPDATE anime a SET
          trailer_youtube_id = COALESCE(a.trailer_youtube_id, v.trailer_id),
          source = COALESCE(a.source, v.source),
          score = COALESCE(a.score, v.average_score),
          favorites = COALESCE(a.favorites, v.favorites),
          popularity_rank = COALESCE(a.popularity_rank, v.popularity_rank),
          aired_from = COALESCE(a.aired_from, v.start_date::timestamptz),
          aired_to = COALESCE(a.aired_to, v.end_date::timestamptz),
          members = COALESCE(a.members, v.favorites)
        FROM (VALUES ${sql.join(
          batch.map(
            (u) =>
              sql`(${u.malId}::int, ${u.trailerId}::text, ${u.source}::text, ${u.averageScore}::real, ${u.favorites}::int, ${u.popularityRank}::int, ${u.startDate}::text, ${u.endDate}::text)`
          ),
          sql`, `
        )}) AS v(mal_id, trailer_id, source, average_score, favorites, popularity_rank, start_date, end_date)
        WHERE a.mal_id = v.mal_id
      `)
    }

    for (const batch of chunk(
      dedupeBy(mangaExternal.splice(0), (m) => m.mangaId),
      1_000
    )) {
      await db.execute(sql`
        INSERT INTO manga_external_ids (manga_id, anilist_id, created_at, updated_at)
        SELECT v.manga_id, v.anilist_id, now(), now()
        FROM (VALUES ${sql.join(
          batch.map((m) => sql`(${m.mangaId}::int, ${m.anilistId}::int)`),
          sql`, `
        )}) AS v(manga_id, anilist_id)
        ON CONFLICT (manga_id) DO UPDATE SET
          anilist_id = EXCLUDED.anilist_id, updated_at = now()
        WHERE manga_external_ids.anilist_id IS DISTINCT FROM EXCLUDED.anilist_id
      `)
    }

    for (const batch of chunk(
      dedupeBy(mangaRows.splice(0), (m) => m.malId),
      1_000
    )) {
      await db.execute(sql`
        INSERT INTO manga (
          mal_id, type, title, title_english, title_japanese, status, chapters, volumes,
          score, popularity_rank, members, favorites, year, synopsis, source,
          country_of_origin, published_from, published_to
        )
        SELECT
          v.mal_id, v.type, v.title, v.title_english, v.title_japanese, v.status,
          v.chapters, v.volumes, v.score, v.popularity_rank, v.favorites, v.favorites,
          v.year, v.synopsis, v.source, v.country_of_origin,
          v.published_from::timestamptz, v.published_to::timestamptz
        FROM (VALUES ${sql.join(
          batch.map(
            (m) =>
              sql`(${m.malId}::int, ${m.type}::text, ${m.title}::text, ${m.titleEnglish}::text, ${m.titleJapanese}::text, ${m.status}::text, ${m.chapters}::int, ${m.volumes}::int, ${m.score}::real, ${m.popularityRank}::int, ${m.favorites}::int, ${m.year}::int, ${m.synopsis}::text, ${m.source}::text, ${m.countryOfOrigin}::text, ${m.publishedFrom}::text, ${m.publishedTo}::text)`
          ),
          sql`, `
        )}) AS v(mal_id, type, title, title_english, title_japanese, status, chapters,
                 volumes, score, popularity_rank, favorites, year, synopsis, source,
                 country_of_origin, published_from, published_to)
        ON CONFLICT (mal_id) DO UPDATE SET
          type = EXCLUDED.type,
          title = EXCLUDED.title,
          title_english = COALESCE(EXCLUDED.title_english, manga.title_english),
          title_japanese = COALESCE(EXCLUDED.title_japanese, manga.title_japanese),
          status = COALESCE(EXCLUDED.status, manga.status),
          chapters = COALESCE(EXCLUDED.chapters, manga.chapters),
          volumes = COALESCE(EXCLUDED.volumes, manga.volumes),
          score = COALESCE(EXCLUDED.score, manga.score),
          popularity_rank = COALESCE(EXCLUDED.popularity_rank, manga.popularity_rank),
          members = COALESCE(EXCLUDED.members, manga.members),
          favorites = COALESCE(EXCLUDED.favorites, manga.favorites),
          year = COALESCE(EXCLUDED.year, manga.year),
          synopsis = COALESCE(EXCLUDED.synopsis, manga.synopsis),
          source = COALESCE(EXCLUDED.source, manga.source),
          country_of_origin = COALESCE(EXCLUDED.country_of_origin, manga.country_of_origin),
          published_from = COALESCE(manga.published_from, EXCLUDED.published_from),
          published_to = COALESCE(manga.published_to, EXCLUDED.published_to)
      `)
    }
  }

  // Mapa de los ids de anime ya presentes (para saber si el idMal existe).
  const knownAnime = new Set(
    (
      (await db.execute(sql`SELECT mal_id FROM anime`)).rows as unknown as {
        mal_id: number
      }[]
    ).map((r) => r.mal_id)
  )

  const queue = [...blocks]
  let processed = 0
  const workers = Array.from(
    { length: Math.min(CONFIG.workers, proxies.length) },
    async (_, w) => {
      const proxy = proxies[w % proxies.length] ?? ''
      const nextAt = { value: 0 }
      for (;;) {
        const block = queue.shift()
        if (!block) break
        const media = await fetchBlock(block, proxy, nextAt)
        stats.media += media.length

        for (const m of media) {
          if (m.type === 'ANIME') {
            if (m.idMal && knownAnime.has(m.idMal)) {
              animeLinks.push({ animeId: m.idMal, anilistId: m.id })
              animeUpdates.push({
                malId: m.idMal,
                bannerImage: m.bannerImage,
                trailerId: m.trailer?.site === 'youtube' ? m.trailer.id : null,
                source: m.source,
                averageScore: m.averageScore ? m.averageScore / 10 : null,
                favorites: m.favourites,
                popularityRank: m.popularity,
                startDate: isoDate(m.startDate),
                endDate: isoDate(m.endDate),
                isAdult: m.isAdult,
              })
              stats.animeLinked++
            } else {
              stats.animeMissing++
            }
            continue
          }

          // MEDIO IMPRESO (manga, novela, one-shot, doujin, manhwa, manhua)
          if (!m.idMal) {
            stats.mangaNoMal++
            continue
          }
          const title = m.title.romaji ?? m.title.english ?? m.title.native
          if (!title) continue
          mangaRows.push({
            malId: m.idMal,
            type: mediaType(m.format),
            title,
            titleEnglish: m.title.english,
            titleJapanese: m.title.native,
            status: m.status,
            chapters: m.chapters,
            volumes: m.volumes,
            score: m.averageScore ? m.averageScore / 10 : null,
            scoredBy: null,
            popularityRank: m.popularity,
            members: m.favourites,
            favorites: m.favourites,
            year: m.startDate?.year ?? m.seasonYear,
            synopsis: m.description,
            source: m.source,
            countryOfOrigin: m.countryOfOrigin,
            publishedFrom: isoDate(m.startDate),
            publishedTo: isoDate(m.endDate),
            anilistId: m.id,
            anilistSiteId: `https://anilist.co/${m.type.toLowerCase()}/${m.id}`,
            coverLarge: m.coverImage?.large ?? null,
            coverExtraLarge: m.coverImage?.extraLarge ?? null,
            banner: m.bannerImage,
            synonyms: [
              ...(m.synonyms ?? []),
              m.title.english ?? null,
              m.title.native ?? null,
            ].filter((s): s is string => typeof s === 'string' && s.length > 0),
          })
          mangaExternal.push({ mangaId: m.idMal, anilistId: m.id })
          stats.mangaRows++
        }

        processed++
        if (processed % 200 === 0) {
          await flush()
          console.log(
            `  ${processed}/${blocks.length} bloques · ${stats.media} medios · anime enlazados ${stats.animeLinked} · manga ${stats.mangaRows} · reintentos ${stats.retries}`
          )
        }
      }
    }
  )

  await Promise.all(workers)
  await flush()

  console.log('\n✓ Enumeración completa')
  console.log(`  peticiones: ${stats.requests} · medios: ${stats.media}`)
  console.log(
    `  anime enlazados a AniList: ${stats.animeLinked} (sin id MAL: ${stats.animeMissing})`
  )
  console.log(
    `  manga/novelas con fila: ${stats.mangaRows} (sin id MAL: ${stats.mangaNoMal})`
  )
  console.log(`  reintentos: ${stats.retries} · errores: ${stats.errors}`)
  process.exit(0)
}

await main()
