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
import { getSourceConfig } from '../config/sources.js'
import { initializeTasks } from '../scripts/initializeTasks.js'
import { initializeJikanRelationsTasks } from '../scripts/initializeJikanRelationsTasks.js'
import { initializeAnimeThemesTasks } from '../scripts/initializeAnimeThemesTasks.js'
import { initializeAnimeMappingTasks } from '../scripts/initializeAnimeMappingTasks.js'
import { initializeAnimeEpisodesTasks } from '../scripts/initializeAnimeEpisodesTasks.js'
import { initializeTvdbSeriesArtworksTasks } from '../scripts/initializeTvdbSeriesArtworksTasks.js'
import { initializeAnilistTasks } from '../scripts/initializeAnilistTasks.js'

const INITIALIZERS: Record<string, () => Promise<void>> = {
  jikan: initializeTasks,
  jikanRelations: initializeJikanRelationsTasks,
  animeThemes: initializeAnimeThemesTasks,
  animeMapping: initializeAnimeMappingTasks,
  animeEpisodes: initializeAnimeEpisodesTasks,
  tvdbSeriesArtworks: initializeTvdbSeriesArtworksTasks,
  anilist: initializeAnilistTasks,
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
        'jikan',
        'jikanRelations',
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

// 2) Drenar todas a la vez con el presupuesto compartido.
const managers = sources.map((source) =>
  new GenericManager(getSourceConfig(source)).useBudget(budget)
)

await Promise.all(managers.map((manager) => manager.init()))

console.log('\n✅ Backfill multi-fuente completado\n')
process.exit(0)
