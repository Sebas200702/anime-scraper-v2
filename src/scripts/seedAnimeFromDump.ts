/**
 * Seed del catálogo desde `anime-offline-database` (sin Jikan, cuota 0).
 *
 *   DUMP_FILE=/tmp/opencode/offline.jsonl bun run db:seed-dump
 *
 * Lee el JSONL streameado e inserta por lotes:
 * - `anime`: **solo faltantes** (`ON CONFLICT DO NOTHING` — jamás degrada una
 *   fila que Jikan ya enriqueció).
 * - `anime_external_ids`: rellena huecos (`COALESCE` — conserva los ids que el
 *   mapping ya resolvió y añade `anilist_id`/`kitsu_id` del dump).
 * - `anime_title_synonym`: solo faltantes.
 *
 * Idempotente: re-correr no duplica ni degrada nada.
 */
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { anime, animeTitleSynonym } from '../schemas/anime.js'
import { animeExternalIds } from '../schemas/animeExternal.js'
import { parseDumpEntry, type ParsedDumpAnime } from '../shared/dumpAnime.js'

const DUMP_FILE = process.argv[2] ?? process.env.DUMP_FILE ?? ''
if (!DUMP_FILE) {
  console.error(
    'Falta el dump. Descarga una vez (6 MB):\n' +
      '  curl -sL -o /tmp/opencode/offline.jsonl.zst https://github.com/manami-project/anime-offline-database/releases/download/2026-27/anime-offline-database.jsonl.zst\n' +
      '  zstd -d -c /tmp/opencode/offline.jsonl.zst > /tmp/opencode/offline.jsonl\n' +
      'Y corre: DUMP_FILE=/tmp/opencode/offline.jsonl bun run db:seed-dump'
  )
  process.exit(1)
}

const CHUNK = 500
let parsed = 0
let skipped = 0
let animeInserted = 0
let synonymInserted = 0
let externalUpserted = 0
let animeBatch: ParsedDumpAnime[] = []
let synonymBatch: { animeId: number; title: string }[] = []

const flushAnime = async () => {
  if (animeBatch.length === 0) return
  const inserted = await db
    .insert(anime)
    .values(
      animeBatch.map((a) => ({
        malId: a.malId,
        title: a.title,
        type: a.type,
        status: a.status,
        episodes: a.episodes,
        year: a.year,
        season: a.season,
      }))
    )
    .onConflictDoNothing()
    .returning({ malId: anime.malId })
  animeInserted += inserted.length

  const ext = await db
    .insert(animeExternalIds)
    .values(
      animeBatch.map((a) => ({
        animeId: a.malId,
        anilistId: a.anilistId,
        kitsuId: a.kitsuId,
      }))
    )
    .onConflictDoUpdate({
      target: [animeExternalIds.animeId],
      // Ojo: aquí el SQL va literal porque drizzle cualificaría una columna
      // interpolada (`excluded."tabla"."col"` es inválido; `excluded."col"` no).
      set: {
        anilistId: sql`COALESCE("anime_external_ids"."anilist_id", excluded."anilist_id")`,
        kitsuId: sql`COALESCE("anime_external_ids"."kitsu_id", excluded."kitsu_id")`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ animeId: animeExternalIds.animeId })
  void ext
  externalUpserted += animeBatch.length
  animeBatch = []
}

const flushSynonyms = async () => {
  if (synonymBatch.length === 0) return
  const inserted = await db
    .insert(animeTitleSynonym)
    .values(synonymBatch)
    .onConflictDoNothing()
    .returning({ id: animeTitleSynonym.id })
  synonymInserted += inserted.length
  synonymBatch = []
}

const rl = createInterface({
  input: createReadStream(DUMP_FILE),
  crlfDelay: Infinity,
})

for await (const line of rl) {
  if (!line.trim()) continue
  let entry: unknown
  try {
    entry = JSON.parse(line)
  } catch {
    skipped++
    continue
  }
  const row = parseDumpEntry(entry as Parameters<typeof parseDumpEntry>[0])
  if (!row) {
    skipped++
    continue
  }
  parsed++
  animeBatch.push(row)
  for (const title of row.synonyms) {
    synonymBatch.push({ animeId: row.malId, title })
  }
  if (animeBatch.length >= CHUNK) await flushAnime()
  // Los sinónimos referencian al anime: siempre se vacía primero el lote de
  // anime para no violar la FK.
  if (synonymBatch.length >= CHUNK * 2) {
    await flushAnime()
    await flushSynonyms()
  }
}
await flushAnime()
await flushSynonyms()

console.log(
  `✓ dump semilla: ${parsed} con mal_id (${skipped} sin clave) · ` +
    `anime +${animeInserted} · sinónimos +${synonymInserted} · external tocados ${externalUpserted}`
)
process.exit(0)
