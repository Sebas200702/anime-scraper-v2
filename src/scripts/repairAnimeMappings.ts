/**
 * Repara los cross-ids de `anime_external_ids` con el cruce autoritativo de
 * Kitsu y limpia los datos derivados que quedaron enganchados al anime
 * equivocado.
 *
 * Contexto: el mapping por título guardaba el **primer** resultado de la
 * búsqueda sin verificarlo. Resultado medido: 8.085 animes con `kitsu_id` no
 * confirmado por Kitsu y, de una muestra de 25, 23 apuntaban a otra serie. Con
 * ese id entraron episodios y miniaturas ajenos (`Naruto` tenía los 500 de
 * `Shippuuden`), y con él se derivó el `tvdb_id`.
 *
 * Fuente de verdad, en orden:
 *   1. `kitsu_crossmap.json` (mappings inversos de Kitsu por MAL id) — exacto.
 *   2. `dump_mal_kitsu.json` (anime-offline-database) — curado, sin conflictos.
 *   3. `null` — mejor sin id que con uno ajeno.
 *
 * Uso:
 *   bun run mappings:repair                 → informe, sin escribir
 *   bun run mappings:repair -- --apply      → aplica y re-encola lo derivado
 */
import { readFile } from 'node:fs/promises'
import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'
import { decideMapping } from '../shared/mappingRepair.js'

const APPLY = process.argv.includes('--apply')
const CROSSMAP = '.cache/kitsu_crossmap.json'
const DUMP = '.cache/dump_mal_kitsu.json'

interface Crossmap {
  byMal: Record<
    string,
    { kitsuId: number; anilistId: number | null; tvdbId: number | null }
  >
}

const main = async () => {
  const cross = JSON.parse(await readFile(CROSSMAP, 'utf8')) as Crossmap
  const dump = JSON.parse(await readFile(DUMP, 'utf8')) as Record<
    string,
    number[]
  >

  const current = (
    await db.execute(
      `SELECT anime_id, kitsu_id, tvdb_id, anilist_id FROM anime_external_ids`
    )
  ).rows as unknown as {
    anime_id: number
    kitsu_id: number | null
    tvdb_id: number | null
    anilist_id: number | null
  }[]

  const allAnime = (
    await db.execute(`SELECT mal_id FROM anime ORDER BY mal_id`)
  ).rows as unknown as { mal_id: number }[]

  type Change = {
    animeId: number
    oldKitsu: number | null
    newKitsu: number | null
    oldTvdb: number | null
    newTvdb: number | null
    newAnilist: number | null
    tvdbTrusted: boolean
  }

  const changes: Change[] = []
  let kitsuFixed = 0
  let kitsuCleared = 0
  let kitsuKept = 0
  let tvdbChanged = 0
  let anilistFilled = 0

  const byId = new Map(current.map((r) => [r.anime_id, r]))

  for (const { mal_id: malId } of allAnime) {
    const row = byId.get(malId)
    const oldKitsu = row?.kitsu_id ?? null
    const oldTvdb = row?.tvdb_id ?? null
    const oldAnilist = row?.anilist_id ?? null

    const decision = decideMapping(
      { kitsuId: oldKitsu, tvdbId: oldTvdb, anilistId: oldAnilist },
      cross.byMal[String(malId)],
      dump[String(malId)]?.[0] ?? null
    )
    const { kitsuId: newKitsu, tvdbId: newTvdb, anilistId: newAnilist } = decision
    const tvdbTrusted = decision.tvdbTrusted

    if (newKitsu === oldKitsu) kitsuKept++
    else if (newKitsu === null) kitsuCleared++
    else kitsuFixed++
    if (newTvdb !== oldTvdb) tvdbChanged++
    if (oldAnilist === null && newAnilist !== null) anilistFilled++

    if (
      newKitsu !== oldKitsu ||
      newTvdb !== oldTvdb ||
      newAnilist !== oldAnilist
    ) {
      changes.push({
        animeId: malId,
        oldKitsu,
        newKitsu,
        oldTvdb,
        newTvdb,
        newAnilist,
        tvdbTrusted,
      })
    }
  }

  console.log(
    `kitsu: ${kitsuKept} intactos · ${kitsuFixed} corregidos · ${kitsuCleared} limpiados (basura)\n` +
      `tvdb: ${tvdbChanged} cambian · anilist: ${anilistFilled} rellenados\n` +
      `filas a tocar: ${changes.length}`
  )

  const kitsuMoved = changes.filter((c) => c.newKitsu !== c.oldKitsu)
  const tvdbMoved = changes.filter((c) => c.newTvdb !== c.oldTvdb)
  console.log(
    `→ episodios a descartar/re-encolar: ${kitsuMoved.length} animes\n` +
      `→ artworks TVDB a descartar/re-encolar: ${tvdbMoved.length} animes`
  )

  if (!APPLY) {
    console.log('\n(sin --apply: informe solamente)')
    process.exit(0)
  }

  // 1) Ids
  for (const batch of chunk(changes, 500)) {
    await db.transaction(async (tx) => {
      for (const c of batch) {
        await tx.execute(`
          INSERT INTO anime_external_ids (anime_id, kitsu_id, tvdb_id, anilist_id, created_at, updated_at)
          VALUES (${c.animeId}, ${lit(c.newKitsu)}, ${lit(c.newTvdb)}, ${lit(c.newAnilist)}, now(), now())
          ON CONFLICT (anime_id) DO UPDATE SET
            kitsu_id = excluded.kitsu_id,
            tvdb_id = excluded.tvdb_id,
            anilist_id = COALESCE(anime_external_ids.anilist_id, excluded.anilist_id),
            updated_at = now()
        `)
      }
    })
  }
  console.log(`✓ ${changes.length} filas de anime_external_ids actualizadas`)

  // 2) Episodios del anime equivocado: fuera (cascada a episode_media).
  const kitsuIds = kitsuMoved.map((c) => c.animeId)
  let episodesDeleted = 0
  for (const batch of chunk(kitsuIds, 500)) {
    const res = await db.execute(
      `DELETE FROM episode WHERE anime_id = ANY(ARRAY[${batch.join(',')}]::int[])`
    )
    episodesDeleted += res.rowCount ?? 0
  }
  console.log(
    `✓ ${episodesDeleted} episodios descartados de ${kitsuIds.length} animes`
  )

  // 3) Tareas de episodios: payload nuevo y a la cola (o skipped si no hay id).
  const rearmed = await taskRepository.rearmEpisodeTasks(
    kitsuMoved.map((c) => ({ animeId: c.animeId, kitsuId: c.newKitsu }))
  )
  console.log(`✓ ${rearmed} tareas de episodios re-encoladas`)

  // 4) Media de TVDB del anime equivocado + re-encolar artworks.
  const staleTvdb = tvdbMoved.filter((c) => !c.tvdbTrusted)
  if (staleTvdb.length > 0) {
    const ids = staleTvdb.map((c) => c.animeId)
    let mediaDeleted = 0
    for (const batch of chunk(ids, 500)) {
      const res = await db.execute(
        `DELETE FROM anime_media WHERE source = 'tvdb' AND anime_id = ANY(ARRAY[${batch.join(',')}]::int[])`
      )
      mediaDeleted += res.rowCount ?? 0
    }
    console.log(`✓ ${mediaDeleted} filas de anime_media de TVDB descartadas`)
  }
  const tvdbRearmed = await taskRepository.rearmTvdbArtworkTasks(
    tvdbMoved.map((c) => ({ animeId: c.animeId, tvdbId: c.newTvdb }))
  )
  console.log(`✓ ${tvdbRearmed} tareas de artworks TVDB re-encoladas`)

  process.exit(0)
}

const lit = (v: number | null) => (v === null ? 'NULL' : String(v))

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

await main()
