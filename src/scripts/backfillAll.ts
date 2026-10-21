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
import { initializeMalHtmlTasks } from '../scripts/initializeMalHtmlTasks.js'
import { initializeMalPeopleTasks } from '../scripts/initializeMalPeopleTasks.js'
import { initializeAnnTasks } from '../scripts/initializeAnnTasks.js'
import { initializeTvdbEpisodesTasks } from '../scripts/initializeTvdbEpisodesTasks.js'
import { initializeTmdbTasks } from '../scripts/initializeTmdbTasks.js'
import { initializeMalMangaTasks } from '../scripts/initializeMalMangaTasks.js'
import { initializeMalCharactersTasks } from '../scripts/initializeMalCharactersTasks.js'
import { initializeMalPersonTasks } from '../scripts/initializeMalPersonTasks.js'
import { initializeAnilistMediaTasks } from '../scripts/initializeAnilistMediaTasks.js'
import { initializeMusicMetaTasks } from '../scripts/initializeMusicMetaTasks.js'
import { initializeMalMangaPageTasks } from '../scripts/initializeMalMangaPageTasks.js'

const INITIALIZERS: Record<string, () => Promise<void>> = {
  jikan: initializeTasks,
  jikanRelations: initializeJikanRelationsTasks,
  animeThemes: initializeAnimeThemesTasks,
  animeMapping: initializeAnimeMappingTasks,
  animeEpisodes: initializeAnimeEpisodesTasks,
  tvdbSeriesArtworks: initializeTvdbSeriesArtworksTasks,
  anilist: initializeAnilistTasks,
  mal: initializeMalDetailsTasks,
  malHtml: initializeMalHtmlTasks,
  malPeople: initializeMalPeopleTasks,
  ann: initializeAnnTasks,
  tvdbEpisodes: initializeTvdbEpisodesTasks,
  tmdb: initializeTmdbTasks,
  malManga: initializeMalMangaTasks,
  malCharacters: initializeMalCharactersTasks,
  malPerson: initializeMalPersonTasks,
  anilistMedia: initializeAnilistMediaTasks,
  musicMeta: initializeMusicMetaTasks,
  malMangaPage: initializeMalMangaPageTasks,
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

console.log(
  `\n🚀 Backfill multi-fuente: ${sources.join(', ')} · ` +
    `${process.env.SCRAPER_PROXIES_PER_SOURCE ?? 10} proxies por fuente\n`
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

// 2) Drenar. Cada fuente con cuota por IP recibe su **propio shard de IPs** y su
//    propio presupuesto de conexiones (`SCRAPER_PROXIES_PER_SOURCE`, 10), así
//    corren en paralelo sin pelearse por las mismas IPs ni por el mismo cupo.
//    Las fuentes con cuota por credencial (MAL, TVDB) van directas.
//    `SCRAPER_SEQUENTIAL=1` drena todo en serie.
const sequential = process.env.SCRAPER_SEQUENTIAL === '1'
const perSource = Number(process.env.SCRAPER_PROXIES_PER_SOURCE ?? 10)

const proxySources = sources.filter((s) => !SINGLE_IP_SOURCES.has(s))
const directSources = sources.filter((s) => SINGLE_IP_SOURCES.has(s))

const shardCount = Math.max(1, proxySources.length)

const runOne = async (source: string, shardIndex: number) => {
  console.log(`\n── drenando ${source} ──`)
  const manager = new GenericManager(getSourceConfig(source))
  if (SINGLE_IP_SOURCES.has(source)) return await manager.init()
  manager.useBudget(
    new ConnectionBudget(
      Number.isInteger(perSource) && perSource > 0 ? perSource : 10
    )
  )
  manager.useProxyShard(shardIndex, shardCount)
  return await manager.init()
}

const runGroup = async (group: string[], offset: number) => {
  if (group.length === 0) return
  if (sequential) {
    for (const [i, source] of group.entries()) await runOne(source, offset + i)
    return
  }
  await Promise.all(group.map((source, i) => runOne(source, offset + i)))
}

await Promise.all([runGroup(proxySources, 0), runGroup(directSources, 0)])

console.log('\n✅ Backfill multi-fuente completado\n')
process.exit(0)
