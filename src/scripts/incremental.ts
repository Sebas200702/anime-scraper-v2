import {
  ALL_DRAIN_SOURCES,
  DEFAULT_BUDGET_PER_SOURCE,
  DEFAULT_DEADLINE_SECONDS,
  DEFAULT_MAX_IN_FLIGHT,
  INCREMENTAL_GROUPS,
} from '../config/incremental.js'
import { getSourceConfig } from '../config/sources.js'
import { GenericManager, type RunSummary } from '../core/genericManager.js'
import { closeDb, pool } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'
import { DERIVED_SOURCES, INITIALIZERS } from './initializers.js'

/**
 * Modo B — actualización incremental sin ingesta completa.
 *
 *   bun run incremental --drain --group=hot --budget=150
 *   bun run incremental --drain --group=slow --budget=300
 *   bun run incremental --discover
 *
 * `--discover` siembra el generador idempotente (solo lo que falta), drena las
 * páginas nuevas del listado y vuelve a sembrar los derivados para que los
 * anime recién descubiertos tengan sus tareas. `--drain` rearma lo vencido y
 * drena un presupuesto acotado. Nunca se re-barre el catálogo: el listado y el
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

const addSummary = (total: RunSummary, partial: RunSummary): void => {
  total.processed += partial.processed
  total.failed += partial.failed
  total.retried += partial.retried
  total.deadLettered += partial.deadLettered
  total.blocked += partial.blocked
  for (const [kind, count] of Object.entries(partial.byKind)) {
    total.byKind[kind] = (total.byKind[kind] ?? 0) + count
  }
}

const emptySummary = (): RunSummary => ({
  processed: 0,
  failed: 0,
  retried: 0,
  deadLettered: 0,
  blocked: 0,
  byKind: {},
})

const sourcesForGroup = (args: Args): string[] => {
  if (args.sources?.length) return args.sources
  if (args.group === 'all') return ALL_DRAIN_SOURCES
  return INCREMENTAL_GROUPS[args.group]
}

const drainSources = async (
  sources: string[],
  args: Args,
  deadline: number
): Promise<RunSummary> => {
  const total = emptySummary()

  for (const source of sources) {
    if (Date.now() >= deadline) {
      console.log('⏱️  Deadline alcanzado: el resto queda para el próximo tick')
      break
    }
    try {
      console.log(`\n── ${source} ──`)
      const manager = new GenericManager(getSourceConfig(source))
      manager.useIncremental({
        maxTasks: args.budget,
        deadline,
        maxInFlight: args.maxInFlight,
      })
      const summary = await manager.init()
      addSummary(total, summary)
    } catch (error) {
      // Una fuente rota no puede tumbar la corrida: las demás siguen.
      console.error(`❌ ${source}: ${(error as Error)?.message ?? error}`)
      total.failed += 1
    }
  }

  return total
}

/**
 * Cierre de temporada: una pasada final de detalles + episodios para los anime
 * que terminaron en las últimas dos semanas. Es un UPDATE acotado (decenas de
 * filas), no un barrido.
 */
const seasonSweep = async (): Promise<number> => {
  const result = await pool.query(`
    WITH recently_finished AS (
      SELECT mal_id FROM anime
      WHERE aired_to IS NOT NULL
        AND aired_to BETWEEN now() - interval '14 days' AND now()
    ), mapped AS (
      SELECT t.id,
             CASE
               WHEN (t.payload->>'animeId') ~ '^[0-9]+$' THEN (t.payload->>'animeId')::int
               WHEN (t.payload->>'anime_id') ~ '^[0-9]+$' THEN (t.payload->>'anime_id')::int
             END AS anime_id
      FROM ingest.task t
      WHERE t.status = 'completed'
        AND t.task_type IN ('anime_details_hydration', 'anime_episodes_hydration')
    )
    UPDATE ingest.task t
    SET status = 'pending', scheduled_at = now(), refresh_after = NULL,
        attempts = 0, leased_until = NULL, updated_at = now()
    FROM mapped m
    JOIN recently_finished a ON a.mal_id = m.anime_id
    WHERE t.id = m.id
  `)
  return result.rowCount ?? 0
}

const discover = async (args: Args, deadline: number): Promise<RunSummary> => {
  const total = emptySummary()

  // 1) Listado: solo páginas nuevas (delta por cursor). Sin re-barrido.
  console.log('\n── discovery: listado (páginas nuevas) ──')
  await INITIALIZERS.jikan?.()

  // 2) Drenar esas páginas para que existan las filas `anime` nuevas.
  addSummary(total, await drainSources(['jikan'], args, deadline))

  // 3) Sembrar derivados: los anime recién creados reciben sus tareas.
  console.log('\n── discovery: tareas derivadas ──')
  for (const source of DERIVED_SOURCES) {
    const initializer = INITIALIZERS[source]
    if (!initializer) continue
    try {
      await initializer()
    } catch (error) {
      console.error(
        `❌ sembrando ${source}: ${(error as Error)?.message ?? error}`
      )
      total.failed += 1
    }
  }

  // 4) Pasada final de los que acaban de terminar.
  const swept = await seasonSweep()
  if (swept > 0)
    console.log(`🏁 ${swept} tareas re-armadas por cierre de temporada`)

  return total
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  const deadline = Date.now() + args.deadlineSeconds * 1000

  // Lock de sesión: dos ticks solapados no compiten por la misma cuota. El
  // claim ya es atómico, pero el lock evita además duplicar el discovery.
  const lockClient = await pool.connect()
  try {
    const lock = await lockClient.query<{ ok: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext('anime-scraper:incremental')) AS ok`
    )
    if (!lock.rows[0]?.ok) {
      console.log('⏳ Ya hay una corrida incremental activa; salto este tick.')
      return
    }

    const runId = await taskRepository.startRun('all', args.mode, {
      group: args.group,
      budget: args.budget,
      sources: args.sources ?? null,
    })

    let total = emptySummary()
    try {
      if (args.mode === 'discover') {
        total = await discover(args, deadline)
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
        },
      })
    }

    console.log(
      `\n✅ incremental ${args.mode}: ${total.processed} ok · ${total.failed} fallos · ` +
        `${total.retried} reintentos · ${total.blocked} bloqueadas · ${total.deadLettered} dead_letter`
    )
  } finally {
    await lockClient
      .query(`SELECT pg_advisory_unlock(hashtext('anime-scraper:incremental'))`)
      .catch(() => {})
    lockClient.release()
  }
}

try {
  await main()
} catch (error) {
  console.error('Fatal incremental:', error)
  process.exitCode = 1
} finally {
  await closeDb()
}
