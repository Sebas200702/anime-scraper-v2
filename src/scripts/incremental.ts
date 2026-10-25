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

  // 5) Lo que murió por causas transitorias (timeout/bloqueo durante una caída
  // de la fuente) vuelve a la cola; no son huecos reales.
  const requeued = await taskRepository.requeueTransientDeadLetters()
  if (requeued > 0)
    console.log(`♻️  ${requeued} dead_letter transitorias re-encoladas`)

  return total
}

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
  try {
    if (args.mode === 'discover') {
      total = await discover(args, deadline)
    } else {
      addSummary(total, await drainSources(sourcesForGroup(args), args, deadline))
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
}

try {
  await main()
} catch (error) {
  console.error('Fatal incremental:', error)
  process.exitCode = 1
} finally {
  await closeDb()
}
