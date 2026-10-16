/**
 * Backfill multi-fuente: drena varias fuentes **en paralelo** compartiendo un
 * único tope de conexiones (el del proveedor de proxies).
 *
 *   SCRAPER_MODE=backfill SCRAPER_CONNECTIONS=10 bun run backfill anilist tvdbSeriesArtworks animeEpisodes animeThemes
 *
 * Por qué existe: cada fuente por separado desperdicia el presupuesto —AniList
 * está limitado a 30 req/min por IP (quiere fan-out de IPs) mientras TVDB tiene
 * una cuota global por API key (no necesita conexiones concurrentes). Con un
 * presupuesto compartido, las dos avanzan a la vez sin romper ninguna cuota y
 * sin abrir más conexiones de las contratadas.
 */
import { ConnectionBudget } from '../core/connectionBudget.js'
import { GenericManager } from '../core/genericManager.js'
import { SINGLE_IP_SOURCES, getSourceConfig } from '../config/sources.js'
import { initializeTasks } from '../scripts/initializeTasks.js'
import { initializeJikanRelationsTasks } from '../scripts/initializeJikanRelationsTasks.js'
import { initializeAnimeThemesTasks } from '../scripts/initializeAnimeThemesTasks.js'
import { initializeAnimeMappingTasks } from '../scripts/initializeAnimeMappingTasks.js'
import { initializeAnimeEpisodesTasks } from '../scripts/initializeAnimeEpisodesTasks.js'
import { initializeTvdbSeriesArtworksTasks } from '../scripts/initializeTvdbSeriesArtworksTasks.js'
import { initializeAnilistTasks } from '../scripts/initializeAnilistTasks.js'
import { initializeMalDetailsTasks } from '../scripts/initializeMalDetailsTasks.js'

const INITIALIZERS: Record<string, () => Promise<void>> = {
  jikan: initializeTasks,
  jikanRelations: initializeJikanRelationsTasks,
  animeThemes: initializeAnimeThemesTasks,
  animeMapping: initializeAnimeMappingTasks,
  animeEpisodes: initializeAnimeEpisodesTasks,
  tvdbSeriesArtworks: initializeTvdbSeriesArtworksTasks,
  anilist: initializeAnilistTasks,
  mal: initializeMalDetailsTasks,
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const seedOnly = process.argv.includes('--seed-only')
const sources =
  args.length > 0
    ? args
    : [
        'animeMapping',
        'animeEpisodes',
        'tvdbSeriesArtworks',
        'anilist',
        'mal',
        'animeThemes',
      ]

const unknown = sources.filter((s) => !INITIALIZERS[s])
if (unknown.length > 0) {
  console.error(`Fuentes desconocidas: ${unknown.join(', ')}`)
  console.error(`Disponibles: ${Object.keys(INITIALIZERS).join(', ')}`)
  process.exit(1)
}

const connections = Number(process.env.SCRAPER_CONNECTIONS ?? 10)
const budget = new ConnectionBudget(
  Number.isInteger(connections) && connections > 0 ? connections : 10
)

console.log(
  `\n🚀 Backfill multi-fuente: ${sources.join(', ')} · ${connections} conexiones compartidas\n`
)

// 1) Sembrar (barato: lecturas de DB + algún listado) — secuencial y acotado por
//    la red. `animeMapping` primero para que episodios/TVDB vean los ids nuevos.
for (const source of sources) {
  console.log(`\n── sembrando ${source} ──`)
  const initializer = INITIALIZERS[source]
  if (initializer) await initializer()
}

if (seedOnly) {
  console.log('\n✅ Sembrado (--seed-only): no se drenó nada.\n')
  process.exit(0)
}

// 2) Drenar. Dos grupos que corren **a la vez**:
//    - proxy: fuentes con cuota por IP → comparten el tope de conexiones del
//      proveedor (`SCRAPER_CONNECTIONS`, 10 en el trial).
//    - directo: fuentes con cuota por API key/client id (MAL, TVDB) → sin proxy,
//      así no consumen ese tope y avanzan en paralelo.
//    `SCRAPER_SEQUENTIAL=1` drena todo en serie (una fuente a la vez).
const sequential = process.env.SCRAPER_SEQUENTIAL === '1'

const proxySources = sources.filter((s) => !SINGLE_IP_SOURCES.has(s))
const directSources = sources.filter((s) => SINGLE_IP_SOURCES.has(s))

const runGroup = async (group: string[]) => {
  if (group.length === 0) return
  if (sequential) {
    for (const source of group) {
      console.log(`\n── drenando ${source} ──`)
      const m = new GenericManager(getSourceConfig(source))
      if (!SINGLE_IP_SOURCES.has(source)) m.useBudget(budget)
      await m.init()
    }
    return
  }
  await Promise.all(
    group.map((source) => {
      console.log(`\n── drenando ${source} ──`)
      const m = new GenericManager(getSourceConfig(source))
      // Solo las fuentes por IP comparten el tope de conexiones del proveedor.
      if (!SINGLE_IP_SOURCES.has(source)) m.useBudget(budget)
      return m.init()
    })
  )
}

await Promise.all([runGroup(proxySources), runGroup(directSources)])

console.log('\n✅ Backfill multi-fuente completado\n')
process.exit(0)
