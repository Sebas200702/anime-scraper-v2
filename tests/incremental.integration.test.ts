import { afterAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { db } from '../src/libs/db.js'
import { taskRepository } from '../src/repositories/tasks.js'

/**
 * Integración del Modo B contra Postgres local (RUN_DB_TESTS=1):
 * presupuesto, intervalos por tarea, hot set y registro de corridas.
 */
const RUN = Boolean(process.env.RUN_DB_TESTS)
const SOURCE = `test-inc-${Date.now()}`

const reset = async () => {
  await db.execute(sql`DELETE FROM ingest.task WHERE source = ${SOURCE}`)
}

const seed = async (count: number) =>
  taskRepository.createManyTasks(
    Array.from({ length: count }, (_, i) => ({
      source: SOURCE,
      taskType: 'anime_details_hydration',
      entityId: `anime_details_${i + 1}`,
      priority: 5,
      payload: { animeId: i + 1 },
    }))
  )

const refreshAfter = async (id: number): Promise<string | null> => {
  const rows = await db.execute(
    sql`SELECT refresh_after FROM ingest.task WHERE id = ${id}`
  )
  return (rows.rows[0] as { refresh_after: string | null }).refresh_after
}

describe.skipIf(!RUN)('incremental (Postgres local)', () => {
  afterAll(async () => {
    await reset()
  })

  test('completeTasksWithRefresh aplica un intervalo por tarea (airing vs nunca)', async () => {
    await reset()
    await seed(2)
    const claimed = await taskRepository.claimTasks(2, SOURCE)
    const [hot, cold] = claimed

    await taskRepository.completeTasksWithRefresh([
      { id: hot!.id, refreshSeconds: 24 * 3600 },
      { id: cold!.id, refreshSeconds: null },
    ])

    expect(await refreshAfter(hot!.id)).not.toBeNull()
    expect(await refreshAfter(cold!.id)).toBeNull()
  })

  test('refreshPolicyFor usa ingest.task_policy y cae al código sin fila', async () => {
    // Sin fila para el source de prueba: fallback a REFRESH_POLICY.
    expect(
      await taskRepository.refreshPolicyFor(SOURCE, 'anime_details_hydration')
    ).toEqual({ cold: null, hot: 24 * 3600 })

    // Discovery puro: nunca.
    expect(
      await taskRepository.refreshPolicyFor(SOURCE, 'anime_page_hydration')
    ).toEqual({ cold: null, hot: null })
  })

  test('hotAnimeIds devuelve un Set (puede estar vacío en DB nueva)', async () => {
    const hot = await taskRepository.hotAnimeIds()
    expect(hot).toBeInstanceOf(Set)
  })

  test('ingest.run registra la corrida y sus contadores', async () => {
    const id = await taskRepository.startRun(SOURCE, 'drain', { budget: 10 })
    await taskRepository.finishRun(id, {
      processed: 7,
      retried: 2,
      blocked: 1,
      deadLettered: 0,
      notes: { group: 'hot' },
    })

    const runs = await taskRepository.recentRuns(5)
    const run = runs.find((r) => r.id === id)
    expect(run).toBeDefined()
    expect(run?.tasksProcessed).toBe(7)
    expect(run?.tasksRetried).toBe(2)
    expect(run?.tasksBlocked).toBe(1)
    expect(run?.finishedAt).not.toBeNull()
  })
})
