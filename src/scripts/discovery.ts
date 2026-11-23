import type { RunSummary } from '../core/genericManager.js'
import { discoveryWarnings } from '../shared/discoveryWarnings.js'
import { addSummary, emptySummary } from './runSummary.js'

export interface DiscoveryDeps {
  /** Fuentes de listado (descubren anime nuevos): se siembran y drenan primero. */
  listing: readonly string[]
  /** Fuentes derivadas: se siembran después, para los anime recién creados. */
  derived: readonly string[]
  initializers: Record<string, () => Promise<void>>
  drain: (sources: string[]) => Promise<RunSummary>
  rearmHot: () => Promise<{ rearmed: number; payloads: number; seeded: number }>
  requeue: () => Promise<number>
  malClientId: string | undefined
  log?: (line: string) => void
  warn?: (line: string) => void
}

/**
 * `--discover`: (0) avisa si falta la credencial de MAL, (1) siembra el
 * listado, (2) lo drena para que existan las filas `anime` nuevas, (3) siembra
 * los derivados (los anime nuevos reciben sus tareas en la misma corrida),
 * (4) re-armado hot y (5) re-encola dead_letter transitorias.
 */
export const runDiscovery = async (
  deps: DiscoveryDeps
): Promise<{ summary: RunSummary; warnings: string[] }> => {
  const log = deps.log ?? console.log
  const warn = deps.warn ?? console.warn
  const total = emptySummary()

  const warnings = discoveryWarnings(deps.malClientId)
  for (const warning of warnings) warn(`⚠️  ${warning.message}`)

  log('\n── discovery: listado (malDiscovery) ──')
  for (const source of deps.listing) await seed(deps, source, total)
  if (deps.listing.length > 0)
    addSummary(total, await deps.drain([...deps.listing]))

  log('\n── discovery: tareas derivadas ──')
  for (const source of deps.derived) await seed(deps, source, total)

  const hot = await deps.rearmHot()
  log(
    `🔥 hot: ${hot.rearmed} re-armadas · ${hot.payloads} payloads · ${hot.seeded} sembradas`
  )

  const requeued = await deps.requeue()
  if (requeued > 0) log(`♻️  ${requeued} dead_letter transitorias re-encoladas`)

  return { summary: total, warnings: warnings.map((w) => w.code) }
}

/** Una fuente rota no tumba el discover: las demás siguen. */
const seed = async (
  deps: DiscoveryDeps,
  source: string,
  total: RunSummary
): Promise<void> => {
  const initializer = deps.initializers[source]
  if (!initializer) return
  try {
    await initializer()
  } catch (error) {
    console.error(
      `❌ sembrando ${source}: ${(error as Error)?.message ?? error}`
    )
    total.failed += 1
  }
}
