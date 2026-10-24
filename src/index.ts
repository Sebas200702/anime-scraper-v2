import { GenericManager } from './core/genericManager.js'
import { getSourceConfig } from './config/sources.js'
import { INITIALIZERS } from './scripts/initializers.js'

/**
 * Ingesta de una fuente: siembra lo que falta y drena lo pendiente/vencido.
 *
 * En prod (Modo B) se usa `incremental.ts` con presupuesto; este entrypoint
 * sigue sirviendo para una pasada completa de una fuente concreta.
 */
async function main() {
  const arg = process.argv[2] || 'jikan'
  const sourceName = Object.keys(INITIALIZERS).includes(arg) ? arg : 'jikan'
  try {
    const config = getSourceConfig(sourceName)
    const initializer = INITIALIZERS[sourceName] as () => Promise<void>
    if (!initializer) {
      throw new Error(`No initializer found for: ${sourceName}`)
    }
    console.log(`\n🚀 Starting ${sourceName}\n`)
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
