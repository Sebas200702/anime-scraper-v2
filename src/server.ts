/**
 * Health/status del scraper (contenedor de Dokploy).
 *
 *   GET /health → 200 si la DB responde y hubo una corrida reciente; 503 si no.
 *   GET /stats  → cola por fuente/tipo/estado, vencidas, hot set, corridas.
 *
 * Mantiene el proceso vivo (los schedules de Dokploy hacen `docker exec` para
 * lanzar `incremental`) y le da a Dokploy un healthcheck real. Sin dominio
 * público sigue sirviendo para el HEALTHCHECK del contenedor.
 */
import { sql } from 'drizzle-orm'
import { db, closeDb, pool } from './libs/db.js'
import { taskRepository } from './repositories/tasks.js'

const PORT = Number(process.env.PORT ?? 3000)
/** Una corrida hot cada 15 min; 8 h cubre el slow de 6 h con margen. */
const STALE_AFTER_MS =
  Number(process.env.HEALTH_STALE_SECONDS ?? 8 * 3600) * 1000
const STATUS_TOKEN = process.env.STATUS_TOKEN

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

const dbOk = async (): Promise<boolean> => {
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  }
}

const lastRun = async () => {
  const rows = await db.execute(sql`
    SELECT id, source, mode, started_at, finished_at,
           tasks_processed, tasks_retried, tasks_blocked, tasks_dead_lettered
    FROM ingest.run
    WHERE finished_at IS NOT NULL
    ORDER BY started_at DESC LIMIT 1
  `)
  return (
    rows.rows as unknown as {
      id: number
      source: string
      mode: string
      started_at: string
      finished_at: string | null
      tasks_processed: number
      tasks_retried: number
      tasks_blocked: number
      tasks_dead_lettered: number
    }[]
  )[0]
}

const dueCount = async (): Promise<number> => {
  const rows = await db.execute(sql`
    SELECT count(*)::int AS count FROM ingest.task
    WHERE status = 'completed' AND refresh_after IS NOT NULL AND refresh_after <= now()
  `)
  return (rows.rows as unknown as { count: number }[])[0]?.count ?? 0
}

const authorized = (request: Request): boolean => {
  if (!STATUS_TOKEN) return true
  const header = request.headers.get('authorization') ?? ''
  return header === `Bearer ${STATUS_TOKEN}`
}

const health = async () => {
  const ok = await dbOk()
  if (!ok) {
    return json({ ok: false, db: false, error: 'DB no responde' }, 503)
  }

  const run = await lastRun()
  const due = await dueCount()
  const age = run?.finished_at
    ? Date.now() - new Date(run.finished_at).getTime()
    : null
  const stale = age !== null && age > STALE_AFTER_MS

  return json(
    {
      ok: !stale,
      db: true,
      uptimeSeconds: Math.floor(process.uptime()),
      due,
      stale,
      lastRun: run ?? null,
    },
    stale ? 503 : 200
  )
}

const stats = async (source?: string) => {
  const [byType, byStatus, due, runs, hot, deadLetters] = await Promise.all([
    taskRepository.statsByType(),
    taskRepository.stats(source),
    taskRepository.dueByType(),
    taskRepository.recentRuns(10),
    taskRepository.hotAnimeIds(),
    db.execute(sql`
      SELECT split_part(coalesce(last_error, 'unknown'), ':', 1) AS kind,
             count(*)::int AS count
      FROM ingest.task WHERE status = 'dead_letter'
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    `),
  ])

  const coverage = await db.execute(sql`
    SELECT status, count(*)::int AS count FROM anime GROUP BY 1 ORDER BY 2 DESC
  `)

  return json({
    ok: true,
    hotAnime: hot.size,
    pending: byStatus,
    due,
    queue: byType.filter((row) => (source ? row.source === source : true)),
    deadLetters: deadLetters.rows,
    coverage: coverage.rows,
    runs,
  })
}

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === '/health') return await health()

    if (url.pathname === '/stats') {
      if (!authorized(request))
        return json({ ok: false, error: 'unauthorized' }, 401)
      return await stats(url.searchParams.get('source') ?? undefined)
    }

    return json({ ok: false, error: 'not found' }, 404)
  },
})

console.log(`🩺 status server en :${server.port}`)

let shuttingDown = false
const shutdown = async () => {
  if (shuttingDown) return
  shuttingDown = true
  server.stop()
  await closeDb().catch(() => {})
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
