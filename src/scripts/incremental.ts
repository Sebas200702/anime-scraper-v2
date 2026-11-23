import {
  ALL_DRAIN_SOURCES,
  DEFAULT_BUDGET_PER_SOURCE,
  DEFAULT_DEADLINE_SECONDS,
  DEFAULT_MAX_IN_FLIGHT,
  INCREMENTAL_GROUPS,
} from '../config/incremental.js'
import { CONFIG } from '../config/config.js'
import { getSourceConfig } from '../config/sources.js'
import { GenericManager, type RunSummary } from '../core/genericManager.js'
import { closeDb, pool } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'
import {
  DERIVED_SOURCES,
  INITIALIZERS,
  LISTING_SOURCES,
} from './initializers.js'
import { runDiscovery } from './discovery.js'
import { addSummary, emptySummary } from './runSummary.js'

/**
 * Modo B — actualización incremental sin ingesta completa.
 *
 *   bun run incremental --drain --group=hot --budget=150
 *   bun run incremental --drain --group=slow --budget=300
 *   bun run incremental --discover
 *
 * Relleno one-off de una sola fuente (p. ej. la carga inicial del reparto de
 * manga, ~70.9k tareas a 1 req/s por IP ≈ 20 h con una IP):
 *
 *   bun src/scripts/incremental.ts --drain --sources=malMangaCharacters --budget=80000 --deadline=86400
 *
 * `--sources=` drena solo esas fuentes (con su lock propio); la cuota la sigue
 * poniendo el `RateGate` por (host, IP).
 *
 * `--discover` siembra y drena `malDiscovery` (temporadas + rankings de MAL;
 * los ids nuevos entran como filas mínimas de `anime`) y luego siembra los
 * derivados para que los anime recién descubiertos tengan sus tareas.
 * `--drain` rearma lo vencido y drena un presupuesto acotado. Nunca se re-barre el catálogo: el listado y el
 * catálogo terminado tienen `refresh_after = NULL`.
 */

interface Args {
  mode: 'drain' | 'discover'
  group: 'hot' | 'slow' | 'all'
  budget: number
  deadlineSeconds: number
  maxInFlight: number
  sources?: string[]
}

const parseArgs = (argv: string[]): Args => {
  const discover = argv.includes('--discover')
  const groupArg = argv.find((a) => a.startsWith('--group='))?.split('=')[1]
  const budgetArg = argv.find((a) => a.startsWith('--budget='))?.split('=')[1]
  const deadlineArg = argv
    .find((a) => a.startsWith('--deadline='))
    ?.split('=')[1]
  const inFlightArg = argv
    .find((a) => a.startsWith('--max-in-flight='))
    ?.split('=')[1]
  const sourcesArg = argv.find((a) => a.startsWith('--sources='))?.split('=')[1]

  const group =
    groupArg === 'hot' || groupArg === 'slow' || groupArg === 'all'
      ? groupArg
      : 'hot'

  return {
    mode: discover ? 'discover' : 'drain',
    group,
    budget:
      Number(budgetArg) > 0 ? Number(budgetArg) : DEFAULT_BUDGET_PER_SOURCE,
    deadlineSeconds:
      Number(deadlineArg) > 0 ? Number(deadlineArg) : DEFAULT_DEADLINE_SECONDS,
    maxInFlight:
      Number(inFlightArg) > 0 ? Number(inFlightArg) : DEFAULT_MAX_IN_FLIGHT,
    sources: sourcesArg ? sourcesArg.split(',').filter(Boolean) : undefined,
  }
}

const sourcesForGroup = (args: Args): string[] => {
  if (args.sources?.length) return args.sources
  if (args.group === 'all') return ALL_DRAIN_SOURCES
  return INCREMENTAL_GROUPS[args.group]
}

/**
 * Lock **por fuente**, no global: el relleno del catálogo (personas, retratos)
 * puede correr en paralelo con el incremental hot sin competir por la cuota de
 * las fuentes que cada uno toca. Dos corridas de la misma fuente sí se excluyen
 * (el claim ya es atómico; esto evita duplicar el trabajo y el gasto de cuota).
 */
const withSourceLock = async (
  source: string,
  run: () => Promise<RunSummary>
): Promise<RunSummary | null> => {
  const client = await pool.connect()
  const key = `anime-scraper:src:${source}`
  try {
    const lock = await client.query<{ ok: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext($1)) AS ok`,
      [key]
    )
    if (!lock.rows[0]?.ok) {
      console.log(`⏳ ${source}: ya hay una corrida activa; salto`)
      return null
    }
    try {
      return await run()
    } finally {
      await client
        .query(`SELECT pg_advisory_unlock(hashtext($1))`, [key])
        .catch(() => {})
    }
  } finally {
    client.release()
  }
}

const drainSources = async (
  sources: string[],
  args: Args,
  deadline: number
): Promise<RunSummary> => {
  const total = emptySummary()

  for (const [index, source] of sources.entries()) {
    if (Date.now() >= deadline) {
      console.log('⏱️  Deadline alcanzado: el resto queda para el próximo tick')
      break
    }
    try {
      console.log(`\n── ${source} ──`)
      // Reparto justo del tiempo: una fuente caída (timeouts) no puede comerse
      // el presupuesto de las demás. Si una termina antes, la siguiente hereda.
      const remainingSources = sources.length - index
      const sliceMs = Math.max(
        30_000,
        Math.floor((deadline - Date.now()) / remainingSources)
      )
      const sourceDeadline = Math.min(deadline, Date.now() + sliceMs)

      const summary = await withSourceLock(source, async () => {
        const manager = new GenericManager(getSourceConfig(source))
        manager.useIncremental({
          maxTasks: args.budget,
          deadline: sourceDeadline,
          maxInFlight: args.maxInFlight,
        })
        return await manager.init()
      })
      if (summary) addSummary(total, summary)
    } catch (error) {
      // Una fuente rota no puede tumbar la corrida: las demás siguen.
      console.error(`❌ ${source}: ${(error as Error)?.message ?? error}`)
      total.failed += 1
    }
  }

  return total
}

const discover = (args: Args, deadline: number) =>
  runDiscovery({
    listing: LISTING_SOURCES,
    derived: DERIVED_SOURCES,
    initializers: INITIALIZERS,
    drain: (sources) => drainSources(sources, args, deadline),
    rearmHot: () => taskRepository.rearmHotTasks(),
    requeue: () => taskRepository.requeueTransientDeadLetters(),
    malClientId: CONFIG.MAL_CLIENT_ID,
  })

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  const deadline = Date.now() + args.deadlineSeconds * 1000

  // El lock es por fuente (ver `withSourceLock`): un relleno de personas puede
  // convivir con el hot de episodios/ficha sin pisarse.
  const runId = await taskRepository.startRun('all', args.mode, {
    group: args.group,
    budget: args.budget,
    sources: args.sources ?? null,
  })

  let total = emptySummary()
  let warnings: string[] = []
  try {
    if (args.mode === 'discover') {
      const result = await discover(args, deadline)
      total = result.summary
      warnings = result.warnings
    } else {
      addSummary(
        total,
        await drainSources(sourcesForGroup(args), args, deadline)
      )
    }
  } finally {
    await taskRepository.finishRun(runId, {
      processed: total.processed,
      retried: total.retried,
      blocked: total.blocked,
      deadLettered: total.deadLettered,
      notes: {
        mode: args.mode,
        group: args.group,
        budget: args.budget,
        failed: total.failed,
        byKind: total.byKind,
        // S4: registro histórico en `ingest.run`. Nadie lo lee: el aviso de
        // incremental:report y /stats se calcula del env (MAL_CLIENT_ID).
        ...(warnings.length > 0 ? { warnings } : {}),
      },
    })
  }

  console.log(
    `\n✅ incremental ${args.mode}: ${total.processed} ok · ${total.failed} fallos · ` +
      `${total.retried} reintentos · ${total.blocked} bloqueadas · ${total.deadLettered} dead_letter`
  )
}

try {
  await main()
} catch (error) {
  console.error('Fatal incremental:', error)
  process.exitCode = 1
} finally {
  await closeDb()
}
