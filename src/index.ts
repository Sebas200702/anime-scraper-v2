import { GenericManager } from './core/genericManager.js'
import { getSourceConfig } from './config/sources.js'
// Initializers
import { initializeTasks } from './scripts/initializeTasks.js'
import { initializeJikanRelationsTasks } from './scripts/initializeJikanRelationsTasks.js'
import { initializeAnimeThemesTasks } from './scripts/initializeAnimeThemesTasks.js'
import { initializeAnimeMappingTasks } from './scripts/initializeAnimeMappingTasks.js'
import { initializeAnimeEpisodesTasks } from './scripts/initializeAnimeEpisodesTasks.js'
import { initializeTvdbSeriesArtworksTasks } from './scripts/initializeTvdbSeriesArtworksTasks.js'
import { initializeAnilistTasks } from './scripts/initializeAnilistTasks.js'
import { initializeMalDetailsTasks } from './scripts/initializeMalDetailsTasks.js'
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
async function main() {
  const arg = process.argv[2] || 'jikan'
  const sourceName = Object.keys(INITIALIZERS).includes(arg) ? arg : 'jikan'
  try {
    const config = getSourceConfig(sourceName)
    const initializer = INITIALIZERS[sourceName] as () => Promise<void>
    if (!initializer) {
      throw new Error(`No initializer found for: ${sourceName}`)
    }
    console.log(`\n��� Starting ${sourceName}\n`)
    await initializer()
    const manager = new GenericManager(config)
    await manager.init()
    console.log(`\n✅ ${sourceName} completed\n`)
  } catch (error: any) {
    console.error('Error:', error.message)
    console.log('\nAvailable sources:', Object.keys(INITIALIZERS).join(', '))
    process.exit(1)
  }
}
await main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
