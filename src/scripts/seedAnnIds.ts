/**
 * Siembra el id de Anime News Network de cada anime desde el dump offline.
 *
 * El dump (`anime-offline-database`) curado por el proyecto manami lista las
 * fuentes de cada anime; de ahí sale el id de ANN **exacto** (sin búsquedas por
 * título, que es donde Kitsu se equivocó). Con 12.619 animes con id de ANN y su
 * enciclopedia publicando OP/ED con nº, artista y rango de episodios, es la
 * fuente que completa la música del catálogo.
 *
 * Uso:
 *   bun run ann:seed-ids [ruta/al/offline.jsonl]
 */
import { readFile } from 'node:fs/promises'
import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'

const DUMP = process.argv[2] ?? process.env.DUMP_FILE ?? '.cache/offline.jsonl'

const annIdOf = (sources: string[]): number | null => {
  for (const source of sources) {
    const match = source.match(
      /animenewsnetwork\.com\/encyclopedia\/anime\.php\?id=(\d+)/i
    )
    if (match) return Number(match[1])
    const alt = source.match(/animenewsnetwork\.com\/.*?id=(\d+)/i)
    if (alt) return Number(alt[1])
  }
  return null
}

const main = async () => {
  let raw: string
  try {
    raw = await readFile(DUMP, 'utf8')
  } catch {
    console.error(
      `No se encuentra el dump en ${DUMP}. Descárgalo una vez:\n` +
        '  curl -sL -o .cache/offline.jsonl.zst https://github.com/manami-project/anime-offline-database/releases/download/2026-27/anime-offline-database.jsonl.zst\n' +
        '  zstd -d -c .cache/offline.jsonl.zst > .cache/offline.jsonl'
    )
    process.exit(1)
  }

  const pairs: { animeId: number; annId: number }[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    let entry: { sources?: string[] }
    try {
      entry = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (!entry.sources) continue
    const mal = entry.sources
      .map((s) => s.match(/myanimelist\.net\/anime\/(\d+)/))
      .find(Boolean)
    if (!mal) continue
    const annId = annIdOf(entry.sources)
    if (!annId) continue
    pairs.push({ animeId: Number(mal[1]), annId })
  }

  console.log(`dump: ${pairs.length} animes con id de ANN`)

  let inserted = 0
  for (let i = 0; i < pairs.length; i += 1000) {
    const batch = pairs.slice(i, i + 1000)
    const res = await db.execute(sql`
      INSERT INTO anime_external_ids (anime_id, ann_id, created_at, updated_at)
      SELECT v.anime_id, v.ann_id, now(), now()
      FROM (VALUES ${sql.join(
        batch.map((p) => sql`(${p.animeId}::int, ${p.annId}::int)`),
        sql`, `
      )}) AS v(anime_id, ann_id)
      -- La FK exige que el anime esté en el catálogo: el dump tiene algún MAL
      -- id que no tenemos (los que MAL borró).
      WHERE EXISTS (SELECT 1 FROM anime a WHERE a.mal_id = v.anime_id)
      ON CONFLICT (anime_id) DO UPDATE
      SET ann_id = COALESCE("anime_external_ids"."ann_id", excluded.ann_id),
          updated_at = now()
    `)
    inserted += res.rowCount ?? 0
  }

  const total = await db.execute(
    sql`SELECT count(*)::int AS n FROM anime_external_ids WHERE ann_id IS NOT NULL`
  )
  console.log(
    `✓ ${inserted} filas tocadas · ${(total.rows[0] as { n: number }).n} animes con id de ANN`
  )
  process.exit(0)
}

await main()
