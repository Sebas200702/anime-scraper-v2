import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { db } from '../src/libs/db.js'
import { taskRepository } from '../src/repositories/tasks.js'
import { HOT_PRIORITY } from '../src/repositories/tasks/hotRearmSql.js'
import {
  APPLY_HOT_SQL,
  HOT_COUNT_SQL,
  PRIORITIZE_AIRING_SQL,
} from '../src/repositories/tasks/normalizeRefreshSql.js'

/**
 * Integración del re-armado hot y del reporte de frescura (S9) contra Postgres
 * local (RUN_DB_TESTS=1). Anime en el rango 9908xx.
 */
const RUN = Boolean(process.env.RUN_DB_TESTS)
const SOURCE = `test-rearm-${Date.now()}`
const CAP_SOURCE = `${SOURCE}-cap`
const TYPE = 'anime_mal_details_hydration'
const HOT = 990801 // Currently Airing
const COLD = 990802 // terminado en 2010
const INCONSISTENT = 990803 // "Not yet aired" que ya empezó
const CLOSED = 990804 // terminó hace 3 días
const ENDS_SOON = 990805 // en emisión, termina en 5 días
const ENDED_10_DAYS = 990806 // terminó hace 10 días (fuera de los viejos 7)
const CLOSE_SOURCE = `${SOURCE}-close`
const ANIME_IDS = [HOT, COLD, INCONSISTENT, CLOSED, ENDS_SOON, ENDED_10_DAYS]
const TVDB_ID = 998801
const EPISODE_ENTITIES = ANIME_IDS.map((id) => `anime_episodes_${id}`)

const inList = (values: (number | string)[]) =>
  sql.join(
    values.map((v) => sql`${v}`),
    sql`, `
  )

const cleanup = async () => {
  await db.execute(
    sql`DELETE FROM ingest.task WHERE source IN (${SOURCE}, ${CAP_SOURCE}, ${CLOSE_SOURCE})`
  )
  await db.execute(sql`
    DELETE FROM ingest.task WHERE source = 'animeEpisodes'
      AND entity_id IN (${inList(EPISODE_ENTITIES)})
  `)
  await db.execute(sql`
    DELETE FROM ingest.task WHERE source = 'tvdbEpisodes' AND entity_id = ${`tvdb_eps_${TVDB_ID}`}
  `)
  await db.execute(sql`DELETE FROM ingest.task_policy WHERE source = ${SOURCE}`)
  await db.execute(sql`DELETE FROM ingest.run WHERE source = ${SOURCE}`)
  await db.execute(
    sql`DELETE FROM anime_external_ids WHERE anime_id IN (${inList(ANIME_IDS)})`
  )
  await db.execute(sql`DELETE FROM anime WHERE mal_id IN (${inList(ANIME_IDS)})`)
}

interface TaskRow {
  entity_id: string
  status: string
  priority: number
  payload: Record<string, unknown> | null
}

const tasks = async (source: string): Promise<TaskRow[]> =>
  (
    await db.execute(sql`
      SELECT entity_id, status, priority, payload FROM ingest.task
      WHERE source = ${source} ORDER BY entity_id
    `)
  ).rows as unknown as TaskRow[]

const insertTask = (
  source: string,
  entityId: string,
  animeId: number,
  status: string,
  refreshAfter: ReturnType<typeof sql>,
  updatedAt: ReturnType<typeof sql> = sql`now()`
) =>
  db.execute(sql`
    INSERT INTO ingest.task (source, task_type, entity_id, payload, priority, status, refresh_after, updated_at)
    VALUES (${source}, ${TYPE}, ${entityId}, ${JSON.stringify({ animeId })}::jsonb, 5, ${status}, ${refreshAfter}, ${updatedAt})
  `)

describe.skipIf(!RUN)('rearmHotTasks (Postgres local)', () => {
  beforeAll(async () => {
    await cleanup()
    await db.execute(sql`
      INSERT INTO anime (mal_id, title, status, aired_from, aired_to) VALUES
        (${HOT}, 'Hot Test', 'Currently Airing', now() - interval '30 days', NULL),
        (${COLD}, 'Cold Test', 'Finished Airing', '2010-01-01', '2010-03-01'),
        (${INCONSISTENT}, 'Inconsistent Test', 'Not yet aired', '2020-01-01', NULL)
    `)
    await insertTask(SOURCE, 'a_null_refresh', HOT, 'completed', sql`NULL`)
    await insertTask(SOURCE, 'b_in_progress', HOT, 'in_progress', sql`NULL`)
    await insertTask(SOURCE, 'c_dead_old', HOT, 'dead_letter', sql`NULL`, sql`now() - interval '7 hours'`)
    await insertTask(SOURCE, 'd_cold', COLD, 'completed', sql`NULL`)
    await insertTask(SOURCE, 'e_inconsistent', INCONSISTENT, 'completed', sql`NULL`)
    await insertTask(SOURCE, 'f_dead_recent', HOT, 'dead_letter', sql`NULL`)
    await insertTask(SOURCE, 'g_fresh', HOT, 'completed', sql`now() + interval '1 hour'`)
  })

  afterAll(cleanup)

  test('re-arma NULL refresh, dead_letter vencido e inconsistente con prioridad 20', async () => {
    const result = await taskRepository.rearmHotTasks(SOURCE)
    expect(result).toEqual({ payloads: 0, seeded: 0, rearmed: 3 })
    expect(
      (await tasks(SOURCE)).map((t) => [t.entity_id, t.status, t.priority])
    ).toEqual([
      ['a_null_refresh', 'pending', HOT_PRIORITY],
      ['b_in_progress', 'in_progress', 5],
      ['c_dead_old', 'pending', HOT_PRIORITY],
      ['d_cold', 'completed', 5],
      ['e_inconsistent', 'pending', HOT_PRIORITY],
      ['f_dead_recent', 'dead_letter', 5],
      ['g_fresh', 'completed', 5],
    ])
  })

  test('una segunda pasada no toca nada', async () => {
    const before = await tasks(SOURCE)
    expect(await taskRepository.rearmHotTasks(SOURCE)).toEqual({
      payloads: 0,
      seeded: 0,
      rearmed: 0,
    })
    expect(await tasks(SOURCE)).toEqual(before)
  })

  test('respeta el tope por pasada', async () => {
    for (const id of ['x1', 'x2', 'x3']) {
      await insertTask(CAP_SOURCE, id, HOT, 'completed', sql`NULL`)
    }
    expect((await taskRepository.rearmHotTasks(CAP_SOURCE, 2)).rearmed).toBe(2)
    const statuses = (await tasks(CAP_SOURCE)).map((t) => t.status).sort()
    expect(statuses).toEqual(['completed', 'pending', 'pending'])
  })

  test('episodios: refresca kitsu_id del payload y siembra la tarea que falta', async () => {
    await db.execute(sql`
      INSERT INTO anime_external_ids (anime_id, kitsu_id, created_at, updated_at) VALUES
        (${HOT}, 995555, now(), now()),
        (${COLD}, 997777, now(), now()),
        (${INCONSISTENT}, 996666, now(), now())
    `)
    await db.execute(sql`
      INSERT INTO ingest.task (source, task_type, entity_id, payload, priority, status)
      VALUES ('animeEpisodes', 'anime_episodes_hydration', ${`anime_episodes_${HOT}`},
              ${JSON.stringify({ kitsu_id: null, anime_id: HOT })}::jsonb, 5, 'completed')
    `)

    const first = await taskRepository.rearmHotTasks('animeEpisodes', 0)
    expect(first.payloads).toBeGreaterThanOrEqual(1)
    expect(first.seeded).toBeGreaterThanOrEqual(1)
    expect(first.rearmed).toBe(0)

    const episodes = (
      await db.execute(sql`
        SELECT entity_id, status, priority, payload FROM ingest.task
        WHERE source = 'animeEpisodes' AND entity_id IN (${inList(EPISODE_ENTITIES)})
        ORDER BY entity_id
      `)
    ).rows as unknown as TaskRow[]
    expect(episodes).toEqual([
      {
        entity_id: `anime_episodes_${HOT}`,
        status: 'pending',
        priority: HOT_PRIORITY,
        payload: { kitsu_id: 995555, anime_id: HOT },
      },
      {
        entity_id: `anime_episodes_${INCONSISTENT}`,
        status: 'pending',
        priority: HOT_PRIORITY,
        payload: { kitsu_id: 996666, anime_id: INCONSISTENT },
      },
    ])

    // Idempotente: el payload ya coincide y la tarea ya existe.
    await taskRepository.rearmHotTasks('animeEpisodes', 0)
    const again = (
      await db.execute(sql`
        SELECT entity_id, status, priority, payload FROM ingest.task
        WHERE source = 'animeEpisodes' AND entity_id IN (${inList(EPISODE_ENTITIES)})
        ORDER BY entity_id
      `)
    ).rows
    expect(again).toEqual(episodes as never)
  })

  test('sin fuente: también siembra la tarea de TVDB', async () => {
    await db.execute(
      sql`UPDATE anime_external_ids SET tvdb_id = ${TVDB_ID} WHERE anime_id = ${HOT}`
    )
    await taskRepository.rearmHotTasks(undefined, 0)
    expect(
      (
        await db.execute(sql`
          SELECT task_type, status, priority, payload FROM ingest.task
          WHERE source = 'tvdbEpisodes' AND entity_id = ${`tvdb_eps_${TVDB_ID}`}
        `)
      ).rows
    ).toEqual([
      {
        task_type: 'tvdb_episodes_hydration',
        status: 'pending',
        priority: HOT_PRIORITY,
        payload: { tvdbId: TVDB_ID, animeId: HOT },
      },
    ] as never)
  })

  test('la política de la DB gana: intervalo hot NULL no se re-arma', async () => {
    await db.execute(sql`
      INSERT INTO ingest.task_policy (source, task_type, refresh_interval_seconds, refresh_interval_airing_seconds)
      VALUES (${SOURCE}, ${TYPE}, NULL, NULL)
    `)
    await insertTask(SOURCE, 'h_policy_null', HOT, 'completed', sql`NULL`)
    expect((await taskRepository.rearmHotTasks(SOURCE)).rearmed).toBe(0)
    const row = (await tasks(SOURCE)).find((t) => t.entity_id === 'h_policy_null')
    expect(row?.status).toBe('completed')
  })
})

describe.skipIf(!RUN)('pasada final de cierre de temporada (Postgres local)', () => {
  const HTML = 'anime_mal_html_hydration' // hot 90 d > ventana de 14 d
  const DETAILS = 'anime_mal_details_hydration' // hot 24 h

  const insertClosing = (
    entityId: string,
    taskType: string,
    animeId: number,
    refreshAfter: ReturnType<typeof sql>,
    lastScrapedAt: ReturnType<typeof sql>
  ) =>
    db.execute(sql`
      INSERT INTO ingest.task (source, task_type, entity_id, payload, priority, status, refresh_after, last_scraped_at)
      VALUES (${CLOSE_SOURCE}, ${taskType}, ${entityId}, ${JSON.stringify({ animeId })}::jsonb, 5, 'completed', ${refreshAfter}, ${lastScrapedAt})
    `)

  const statuses = async () =>
    (await tasks(CLOSE_SOURCE)).map((t) => [t.entity_id, t.status])

  beforeAll(async () => {
    await cleanup()
    await db.execute(sql`
      INSERT INTO anime (mal_id, title, status, aired_from, aired_to) VALUES
        (${CLOSED}, 'Closed Test', 'Finished Airing', now() - interval '90 days', now() - interval '3 days'),
        (${ENDS_SOON}, 'Ends Soon Test', 'Currently Airing', now() - interval '80 days', now() + interval '5 days')
    `)
    await insertClosing('a_html_before', HTML, CLOSED, sql`now() + interval '80 days'`, sql`now() - interval '10 days'`)
    await insertClosing('b_html_before', HTML, CLOSED, sql`now() + interval '80 days'`, sql`now() - interval '20 days'`)
    await insertClosing('c_html_after', HTML, CLOSED, sql`now() + interval '89 days'`, sql`now() - interval '1 day'`)
    await insertClosing('d_details_before', DETAILS, CLOSED, sql`now() + interval '12 hours'`, sql`now() - interval '10 days'`)
    await insertClosing('e_html_not_ended', HTML, ENDS_SOON, sql`now() + interval '80 days'`, sql`now() - interval '10 days'`)
  })

  afterAll(cleanup)

  test('re-arma una vez el reparto scrapeado antes de aired_to, respetando el tope', async () => {
    expect((await taskRepository.rearmHotTasks(CLOSE_SOURCE, 1)).rearmed).toBe(1)
    expect((await taskRepository.rearmHotTasks(CLOSE_SOURCE)).rearmed).toBe(1)
    expect(await statuses()).toEqual([
      ['a_html_before', 'pending'],
      ['b_html_before', 'pending'],
      ['c_html_after', 'completed'],
      ['d_details_before', 'completed'],
      ['e_html_not_ended', 'completed'],
    ])
  })

  test('una vez scrapeada tras aired_to no se re-arma otra vez (sin bucle)', async () => {
    const ids = (
      await db.execute(sql`
        SELECT id FROM ingest.task WHERE source = ${CLOSE_SOURCE} AND status = 'pending'
      `)
    ).rows.map((r) => Number((r as { id: number }).id))
    await taskRepository.completeTasks(ids, 90 * 86400)
    expect((await taskRepository.rearmHotTasks(CLOSE_SOURCE)).rearmed).toBe(0)
    expect((await statuses()).every(([, status]) => status === 'completed')).toBe(true)
  })
})

describe.skipIf(!RUN)('incremental:normalize usa el hot set compartido (Postgres local)', () => {
  beforeAll(cleanup)
  afterAll(cleanup)

  test('un anime terminado hace 10 días cuenta como hot (ventana de 14 días)', async () => {
    const count = async () =>
      Number(((await db.execute(sql.raw(HOT_COUNT_SQL))).rows[0] as { count: string }).count)
    const before = await count()
    await db.execute(sql`
      INSERT INTO anime (mal_id, title, status, aired_from, aired_to) VALUES
        (${ENDED_10_DAYS}, 'Ended 10 Days', 'Finished Airing', now() - interval '100 days', now() - interval '10 days')
    `)
    expect(await count()).toBe(before + 1)
  })

  test('las sentencias de cadencia y prioridad son SQL válido (EXPLAIN, sin ejecutar)', async () => {
    for (const query of [APPLY_HOT_SQL, PRIORITIZE_AIRING_SQL]) {
      const plan = await db.execute(sql.raw(`EXPLAIN ${query}`))
      expect(plan.rows.length).toBeGreaterThan(0)
    }
  })
})

describe.skipIf(!RUN)('incremental:report (Postgres local)', () => {
  beforeAll(async () => {
    await cleanup()
    await db.execute(sql`
      INSERT INTO anime (mal_id, title, status, aired_from) VALUES
        (${INCONSISTENT}, 'Inconsistent Report', 'Not yet aired', '2020-01-01')
    `)
    await db.execute(sql`
      INSERT INTO ingest.run (source, mode, notes) VALUES
        (${SOURCE}, 'drain', ${JSON.stringify({ group: 'hot-report-test' })}),
        (${SOURCE}, 'drain', 'texto libre')
    `)
  })

  afterAll(cleanup)

  test('corre en solo lectura e imprime las cuatro vistas', async () => {
    const snapshot = async () =>
      (
        await db.execute(sql`
          SELECT (SELECT count(*) FROM ingest.task)::int AS tasks,
                 (SELECT max(updated_at)::text FROM ingest.task) AS touched,
                 (SELECT count(*) FROM ingest.run)::int AS runs
        `)
      ).rows[0]
    const before = await snapshot()

    const proc = Bun.spawnSync(['bun', 'src/scripts/stalenessReport.ts'], {
      env: process.env,
    })
    const out = proc.stdout.toString()
    expect(proc.stderr.toString()).not.toContain('Fatal')
    expect(proc.exitCode).toBe(0)
    for (const title of ['A ·', 'B ·', 'C ·', 'D ·']) {
      expect(out).toContain(`── ${title}`)
    }
    expect(out).toContain('Inconsistent Report')
    expect(out).toContain('hot-report-test')
    expect(await snapshot()).toEqual(before)
  })
})
