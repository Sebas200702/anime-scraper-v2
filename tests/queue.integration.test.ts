import { afterAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { db } from '../src/libs/db.js'
import { taskRepository } from '../src/repositories/tasks.js'

/**
 * Integración real de la cola `ingest.*` contra Postgres local.
 *
 * Se salta por defecto (el gate de unit no necesita DB): córrelo con
 * `bun run test:integration` teniendo la DB local migrada.
 */
const RUN = Boolean(process.env.RUN_DB_TESTS)
const SOURCE = `test-${Date.now()}`

const reset = async () => {
  await db.execute(sql`DELETE FROM ingest.task WHERE source = ${SOURCE}`)
}

const rawStatus = async (ids: number[]) => {
  const rows = await db.execute(sql`
    SELECT id, status, attempts, leased_until, refresh_after, last_error, skip_reason
    FROM ingest.task WHERE id IN (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `
    )})
    ORDER BY id
  `)
  return rows.rows as unknown as {
    id: number
    status: string
    attempts: number
    leased_until: string | null
    refresh_after: string | null
    last_error: string | null
    skip_reason: string | null
  }[]
}

const seed = async (count: number) =>
  taskRepository.createManyTasks(
    Array.from({ length: count }, (_, i) => ({
      source: SOURCE,
      taskType: 'anime_details_hydration',
      entityId: `anime_${i}`,
      priority: 5,
      payload: { animeId: i },
    }))
  )

describe.skipIf(!RUN)('cola ingest.* (Postgres local)', () => {
  afterAll(async () => {
    await reset()
  })

  test('el claim es atómico: dos claimers concurrentes no comparten tareas', async () => {
    await reset()
    await seed(10)

    const [first, second] = await Promise.all([
      taskRepository.claimTasks(6, SOURCE),
      taskRepository.claimTasks(6, SOURCE),
    ])

    const ids = [...first.map((t) => t.id), ...second.map((t) => t.id)]
    expect(ids).toHaveLength(10)
    expect(new Set(ids).size).toBe(10) // ni una repetida
    expect(first.length + second.length).toBe(10)
  })

  test('el intento se cuenta al claimear (attempts++)', async () => {
    await reset()
    await seed(1)
    const [task] = await taskRepository.claimTasks(1, SOURCE)
    expect(task?.attempts).toBe(1)

    const [row] = await rawStatus([task!.id])
    expect(row?.status).toBe('in_progress')
    expect(row?.leased_until).not.toBeNull()
  })

  test('un lease vencido vuelve a pending (reaper)', async () => {
    await reset()
    await seed(1)
    const [task] = await taskRepository.claimTasks(1, SOURCE)

    await db.execute(sql`
      UPDATE ingest.task SET leased_until = now() - interval '1 minute' WHERE id = ${task!.id}
    `)

    const requeued = await taskRepository.reapExpiredLeases(SOURCE)
    expect(requeued).toBe(1)

    const [row] = await rawStatus([task!.id])
    expect(row?.status).toBe('pending')

    // y se puede volver a claimear
    const again = await taskRepository.claimTasks(1, SOURCE)
    expect(again[0]?.id).toBe(task!.id)
  })

  test('intentos agotados → dead_letter', async () => {
    await reset()
    await seed(1)
    const [task] = await taskRepository.claimTasks(1, SOURCE)

    await db.execute(
      sql`UPDATE ingest.task SET attempts = max_attempts WHERE id = ${task!.id}`
    )

    const result = await taskRepository.failTasks([task!.id], 'agotado')
    expect(result.deadLettered).toBe(1)

    const [row] = await rawStatus([task!.id])
    expect(row?.status).toBe('dead_letter')
    expect(row?.last_error).toBe('agotado')

    // ya no se claima
    expect(await taskRepository.claimTasks(5, SOURCE)).toHaveLength(0)
  })

  test('un fallo no reintentable va directo a dead_letter', async () => {
    await reset()
    await seed(1)
    const [task] = await taskRepository.claimTasks(1, SOURCE)

    const result = await taskRepository.failTasks(
      [task!.id],
      '404 not found',
      undefined,
      false
    )
    expect(result.deadLettered).toBe(1)

    const [row] = await rawStatus([task!.id])
    expect(row?.status).toBe('dead_letter')
  })

  test('un fallo reintentable vuelve a pending con backoff', async () => {
    await reset()
    await seed(1)
    const [task] = await taskRepository.claimTasks(1, SOURCE)

    const result = await taskRepository.failTasks(
      [task!.id],
      '429',
      60_000,
      true
    )
    expect(result.retried).toBe(1)

    const [row] = await rawStatus([task!.id])
    expect(row?.status).toBe('pending')

    // scheduled_at quedó en el futuro (backoff del Retry-After)
    expect(await taskRepository.claimTasks(5, SOURCE)).toHaveLength(0)
  })

  test('completar programa el refresh y rearmDueTasks lo re-arma', async () => {
    await reset()
    await seed(1)
    const [task] = await taskRepository.claimTasks(1, SOURCE)

    await taskRepository.completeTasks([task!.id], 3600)
    const [row] = await rawStatus([task!.id])
    expect(row?.status).toBe('completed')
    expect(row?.refresh_after).not.toBeNull()

    // todavía no vence
    expect(await taskRepository.rearmDueTasks(SOURCE)).toBe(0)

    // se adelanta el vencimiento
    await db.execute(
      sql`UPDATE ingest.task SET refresh_after = now() - interval '1 minute' WHERE id = ${task!.id}`
    )
    expect(await taskRepository.rearmDueTasks(SOURCE)).toBe(1)

    const [due] = await rawStatus([task!.id])
    expect(due?.status).toBe('pending')
  })

  test('el generador es idempotente (no duplica trabajo)', async () => {
    await reset()
    expect(await seed(5)).toBe(5)
    expect(await seed(5)).toBe(0) // ya existían

    const rows = await db.execute(
      sql`SELECT count(*)::int AS n FROM ingest.task WHERE source = ${SOURCE}`
    )
    expect((rows.rows[0] as { n: number }).n).toBe(5)
  })

  test('skipped no consume reintentos y se re-arma en la corrida siguiente', async () => {
    await reset()
    await seed(2)
    const claimed = await taskRepository.claimTasks(2, SOURCE)
    const target = claimed[0]!

    await taskRepository.skipTasks([target.id], 'missing:kitsu_id')

    const [row] = await rawStatus([target.id])
    expect(row?.status).toBe('skipped')
    expect(row?.skip_reason).toBe('missing:kitsu_id')
    expect(row?.leased_until).toBeNull()
    expect(row?.attempts).toBe(1) // ya se había contado al claimear; skipped no suma

    // mientras está skipped no se claima
    const duringSkip = await taskRepository.claimTasks(5, SOURCE)
    expect(duringSkip.map((t) => t.id)).not.toContain(target.id)

    // la siguiente corrida lo re-arma (self-healing)
    expect(await taskRepository.rearmSkippedTasks(SOURCE)).toBe(1)
    const after = await taskRepository.claimTasks(5, SOURCE)
    expect(after.map((t) => t.id)).toContain(target.id)
  })

  test('stats resume la cola por estado', async () => {
    await reset()
    await seed(3)
    const claimed = await taskRepository.claimTasks(1, SOURCE)
    await taskRepository.completeTasks([claimed[0]!.id])

    const stats = await taskRepository.stats(SOURCE)
    expect(stats.completed).toBe(1)
    expect(stats.in_progress).toBe(0)
    expect(stats.pending).toBe(2)
  })
})
