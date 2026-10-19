/**
 * Cruce autoritativo Kitsu → {mal, anilist, tvdb}.
 *
 * El mapping por título (`kitsuMapping`) devolvía el **primer** resultado de la
 * búsqueda sin verificarlo: 8.085 animes quedaron con un `kitsu_id` ajeno (la
 * verificación contra Kitsu dio 23/25 mal) y, con él, episodios y miniaturas de
 * otra serie. Kitsu sí expone el mapping inverso exacto:
 *
 *   GET /mappings?filter[externalSite]=myanimelist/anime&filter[externalId]=20
 *
 * y cada mapping trae su anime (`relationships.item.data.id` con `include=item`).
 * Recorriendo TODOS los mappings una vez (21.161 de MAL + 19.075 de AniList +
 * 5.148 de TVDB ≈ 2.270 requests) se arma el cruce completo por anime — sin
 * búsquedas difusas y en minutos.
 *
 * Uso:
 *   bun run kitsu:crossmap            → /tmp/opencode/kitsu_crossmap.json
 *   bun run kitsu:crossmap --out x.json
 */
import { readFile, writeFile } from 'node:fs/promises'
import { CONFIG } from '../config/config.js'
import { fetcher } from '../libs/fetcher.js'

const BASE = CONFIG.KITSU_BASE || 'https://kitsu.io/api/edge'
const SITES = [
  'myanimelist/anime',
  'anilist/anime',
  'thetvdb/series',
  'thetvdb',
]
const LIMIT = 20
const CONCURRENCY = 8

interface MappingRow {
  externalSite: string
  externalId: string
  itemId: string
  /** `anime` o `manga`: Kitsu tiene mappings cruzados (un `myanimelist/anime`
   *  puede apuntar a un manga por error de datos). Solo sirve `anime`. */
  itemType: string
}

const outIdx = process.argv.indexOf('--out')
const OUT: string =
  (outIdx > -1 ? process.argv[outIdx + 1] : undefined) ??
  '/tmp/opencode/kitsu_crossmap.json'

const loadProxies = async (): Promise<string[]> => {
  try {
    const raw = await readFile('proxies.json', 'utf8')
    return (JSON.parse(raw) as string[]).map((p) => `http://${p}`)
  } catch {
    return []
  }
}

/** Una página de mappings de un sitio, con el anime incluido. */
const fetchPage = async (
  site: string,
  offset: number,
  proxy: string
): Promise<{ rows: MappingRow[]; count: number }> => {
  const url =
    `${BASE}/mappings?filter[externalSite]=${encodeURIComponent(site)}` +
    `&page[limit]=${LIMIT}&page[offset]=${offset}&include=item`
  const json = await fetcher<{ data?: any[]; meta?: { count?: number } }>({
    url,
    method: 'GET',
    headers: { Accept: 'application/vnd.api+json' },
    agent: proxy,
    timeoutMs: 25_000,
  })
  const rows = (json.data ?? [])
    .map((m) => ({
      externalSite: m.attributes?.externalSite ?? site,
      externalId: String(m.attributes?.externalId ?? ''),
      itemId: String(m.relationships?.item?.data?.id ?? ''),
      itemType: String(m.relationships?.item?.data?.type ?? ''),
    }))
    .filter((r) => r.itemId && r.externalId)
  return { rows, count: json.meta?.count ?? 0 }
}

const main = async () => {
  const proxies = await loadProxies()
  if (proxies.length === 0)
    throw new Error('Necesito proxies.json para el barrido')

  const byItem = new Map<string, Record<string, string>>()
  let requests = 0
  let cursor = 0
  const nextProxy = (): string =>
    proxies[cursor++ % proxies.length] ?? proxies[0]!

  for (const site of SITES) {
    const first = await fetchPage(site, 0, nextProxy() ?? '')
    requests++
    const total = first.count
    const offsets: number[] = []
    for (let o = LIMIT; o < total; o += LIMIT) offsets.push(o)
    console.log(`▶ ${site}: ${total} mappings (${offsets.length + 1} páginas)`)

    const absorb = (rows: MappingRow[]) => {
      for (const row of rows) {
        // Sin este filtro se colaban ids de MANGA como si fueran animes: sus
        // `/anime/{id}/episodes` dan 404 y el anime quedaba sin episodios.
        if (row.itemType !== 'anime') continue
        const entry = byItem.get(row.itemId) ?? {}
        // TVDB viene en dos formas (`78857` y `78857/1`): la serie es lo de antes.
        const value = site.startsWith('thetvdb')
          ? (row.externalId.split('/')[0] ?? '')
          : row.externalId
        if (!entry[row.externalSite]) entry[row.externalSite] = value
        byItem.set(row.itemId, entry)
      }
    }
    absorb(first.rows)

    let done = 0
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (offsets.length > 0) {
        const offset = offsets.shift() as number
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const { rows } = await fetchPage(site, offset, nextProxy())
            requests++
            absorb(rows)
            break
          } catch (error) {
            if (attempt === 3) {
              console.warn(
                `  ✗ ${site} offset ${offset}: ${(error as Error).message}`
              )
            }
          }
        }
        if (++done % 200 === 0) console.log(`  … ${done} páginas`)
      }
    })
    await Promise.all(workers)
    console.log(`✓ ${site} completo (${byItem.size} animes con mapping)`)
  }

  // Invertir: kitsu item → mal id (y anilist/tvdb del mismo item).
  const byMal: Record<
    string,
    { kitsuId: number; anilistId: number | null; tvdbId: number | null }
  > = {}
  const conflicts: number[] = []
  for (const [itemId, ext] of byItem) {
    const mal = Number(ext['myanimelist/anime'])
    if (!Number.isInteger(mal) || mal <= 0) continue
    const kitsuId = Number(itemId)
    if (byMal[mal]) {
      conflicts.push(mal)
      continue
    }
    byMal[mal] = {
      kitsuId,
      anilistId: Number(ext['anilist/anime']) || null,
      tvdbId: Number(ext['thetvdb/series'] ?? ext['thetvdb']) || null,
    }
  }

  // Verificación de liveness: Kitsu tiene mappings que apuntan a animes
  // **borrados** (`/anime/3341` → 404 con la fila de mapping aún viva), así que
  // el cruce por sí solo no basta: sin este filtro el anime quedaba con un
  // `kitsu_id` que no se puede fetchear (1.567 animes murieron así).
  const kitsuIds = [...new Set(Object.values(byMal).map((v) => v.kitsuId))]
  const vivos = new Set<number>()
  const pendientes = [...kitsuIds]
  let probados = 0
  const verificadores = Array.from({ length: CONCURRENCY }, async () => {
    while (pendientes.length > 0) {
      const id = pendientes.shift() as number
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await fetcher({
            url: `${BASE}/anime/${id}?fields[id]`,
            method: 'GET',
            headers: { Accept: 'application/vnd.api+json' },
            agent: nextProxy(),
            timeoutMs: 15_000,
          })
          vivos.add(id)
          break
        } catch (error: any) {
          // 404 ⇒ el anime ya no existe en Kitsu; cualquier otro fallo se
          // reintenta y, si persiste, se trata como vivo (no perder el id).
          if (error?.status === 404 || /404/.test(String(error?.message))) break
          if (attempt === 3) vivos.add(id)
        }
      }
      if (++probados % 1000 === 0)
        console.log(`  … ${probados}/${kitsuIds.length} verificados`)
    }
  })
  await Promise.all(verificadores)
  requests += kitsuIds.length

  let muertos = 0
  for (const [mal, entry] of Object.entries(byMal)) {
    if (!vivos.has(entry.kitsuId)) {
      delete byMal[mal]
      muertos++
    }
  }
  console.log(
    `⏱  liveness Kitsu: ${kitsuIds.length} probados · ${muertos} animes cruzados a entidades borradas (descartados)`
  )

  await writeFile(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), byMal }, null, 0)
  )
  console.log(
    `\n✅ ${Object.keys(byMal).length} animes cruzados · ${requests} requests · ` +
      `conflictos de MAL id: ${conflicts.length} → ${OUT}`
  )
}

await main()
process.exit(0)
