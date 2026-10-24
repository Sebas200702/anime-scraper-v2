import { and, eq, inArray, sql } from 'drizzle-orm'
import { CONFIG } from '../config/config.js'
import { REFRESH_POLICY, type RefreshPolicy } from '../config/sources.js'
import { db } from '../libs/db.js'
import {
  TASK_STATUSES,
  ingestRun,
  ingestTask,
  ingestTaskPolicy,
  type TaskStatus,
} from '../schemas/ingest.js'
import { mapTaskRow, type RawTaskRow } from '../shared/taskMapper.js'
import type { NewScrapingTask, ScrapingTask } from '../types/index.js'

/** Trocea sin depender de `utils/chunk` (evita el ciclo repo → utils → schemas). */
const chunkArray = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

/**
 * Cola de ingesta en Postgres (`ingest.*`).
 *
 * Propiedades que da el motor y que la versión Turso no tenía:
 * - **claim atómico** con `FOR UPDATE SKIP LOCKED` (dos procesos nunca se
 *   reparten la misma tarea),
 * - **lease** con reaper (un proceso que muere no pierde el slice),
 * - `attempts` → `dead_letter` (nada queda reintentándose para siempre),
 * - `refresh_after` para re-armar lo vencido sin duplicar filas.
 */

const sourceFilter = (source?: string) =>
  source ? sql`AND source = ${source}` : sql``

const idList = (ids: number[]) =>
  sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `
  )

export const taskRepository = {
  /**
   * Claim atómico de hasta `limit` tareas listas, marcándolas `in_progress`
   * con lease. `attempts` se incrementa aquí (el intento ya empezó).
   */
  async claimTasks(limit: number, source?: string): Promise<ScrapingTask[]> {
    const result = await db.execute(sql`
      WITH due AS (
        SELECT id FROM ingest.task
        WHERE status = 'pending' AND scheduled_at <= now() ${sourceFilter(source)}
        ORDER BY priority DESC, scheduled_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE ingest.task t
      SET status = 'in_progress',
          leased_until = now() + (${CONFIG.TASK_LEASE_SECONDS} * interval '1 second'),
          attempts = t.attempts + 1,
          updated_at = now()
      FROM due
      WHERE t.id = due.id
      RETURNING t.*
    `)

    return (result.rows as unknown as RawTaskRow[]).map(mapTaskRow)
  },

  /** Marca tareas como completadas y programa su próximo refresh. */
  async completeTasks(taskIds: number[], refreshSeconds?: number) {
    if (taskIds.length === 0) return
    await db
      .update(ingestTask)
      .set({
        status: 'completed',
        leasedUntil: null,
        lastScrapedAt: sql`now()`,
        refreshAfter: refreshSeconds
          ? sql`now() + (${refreshSeconds} * interval '1 second')`
          : null,
        updatedAt: sql`now()`,
      })
      .where(inArray(ingestTask.id, taskIds))
  },

  /**
   * Completa tareas **cada una con su intervalo**: un lote puede mezclar un
   * anime en emisión (24 h) con uno terminado (`null` = nunca). Agrupa por
   * intervalo para no hacer un UPDATE por fila.
   */
  async completeTasksWithRefresh(
    entries: { id: number; refreshSeconds: number | null }[]
  ): Promise<void> {
    if (entries.length === 0) return

    const groups = new Map<number | null, number[]>()
    for (const entry of entries) {
      const ids = groups.get(entry.refreshSeconds) ?? []
      ids.push(entry.id)
      groups.set(entry.refreshSeconds, ids)
    }

    await Promise.all(
      [...groups.entries()].map(([seconds, ids]) =>
        db
          .update(ingestTask)
          .set({
            status: 'completed',
            leasedUntil: null,
            lastScrapedAt: sql`now()`,
            refreshAfter: seconds
              ? sql`now() + (${seconds} * interval '1 second')`
              : null,
            updatedAt: sql`now()`,
          })
          .where(inArray(ingestTask.id, ids))
      )
    )
  },

  /**
   * Registra el fallo: reintenta con backoff (respetando `Retry-After`) o pasa a
   * `dead_letter` si ya no quedan intentos.
   */
  async failTasks(
    taskIds: number[],
    reason: string,
    retryAfterMs?: number,
    retryable = true
  ): Promise<{ retried: number; deadLettered: number }> {
    if (taskIds.length === 0) return { retried: 0, deadLettered: 0 }

    const backoffSeconds = Math.max(
      1,
      Math.round((retryAfterMs ?? 30_000) / 1000)
    )

    const result = await db.execute(sql`
      UPDATE ingest.task
      SET status = CASE WHEN ${retryable} = false OR attempts >= max_attempts
                        THEN 'dead_letter' ELSE 'pending' END,
          scheduled_at = CASE WHEN ${retryable} = false OR attempts >= max_attempts
                              THEN scheduled_at
                              ELSE now() + (${backoffSeconds} * interval '1 second') END,
          leased_until = NULL,
          last_error = ${reason},
          updated_at = now()
      WHERE id IN (${idList(taskIds)})
      RETURNING status
    `)

    const rows = result.rows as unknown as { status: TaskStatus }[]
    return {
      retried: rows.filter((r) => r.status === 'pending').length,
      deadLettered: rows.filter((r) => r.status === 'dead_letter').length,
    }
  },

  /**
   * Reaper: devuelve a `pending` los leases vencidos (o a `dead_letter` si se
   * agotaron los intentos). Se corre al arrancar y en cada lote.
   */
  async reapExpiredLeases(source?: string): Promise<number> {
    const requeued = await db.execute(sql`
      UPDATE ingest.task
      SET status = 'pending', leased_until = NULL, scheduled_at = now(), updated_at = now()
      WHERE status = 'in_progress' AND leased_until < now()
        AND attempts < max_attempts ${sourceFilter(source)}
    `)

    const dead = await db.execute(sql`
      UPDATE ingest.task
      SET status = 'dead_letter', leased_until = NULL,
          last_error = coalesce(last_error, 'lease expirado'), updated_at = now()
      WHERE status = 'in_progress' AND leased_until < now()
        AND attempts >= max_attempts ${sourceFilter(source)}
    `)

    return (requeued.rowCount ?? 0) + (dead.rowCount ?? 0)
  },

  /** Compatibilidad con el arranque anterior al porte. */
  async resetStaleTasks(source?: string): Promise<number> {
    return this.reapExpiredLeases(source)
  },

  /**
   * Generador idempotente: crea lo que falta, sin tocar lo existente.
   * Re-armar lo vencido es `rearmDueTasks`.
   */
  async createManyTasks(tasks: NewScrapingTask[]): Promise<number> {
    if (tasks.length === 0) return 0

    const rows = tasks.map((task) => ({
      source: task.source,
      taskType: task.taskType,
      entityId: task.entityId,
      payload: task.payload ?? {},
      priority: task.priority ?? 0,
      status: task.status ?? 'pending',
      maxAttempts: task.maxAttempts ?? 3,
    }))

    const chunkSize = 500
    let created = 0
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize)
      const inserted = await db
        .insert(ingestTask)
        .values(chunk)
        .onConflictDoNothing()
        .returning({ id: ingestTask.id })
      created += inserted.length
    }

    return created
  },

  /**
   * Re-arma las tareas vencidas por política: pasan de `completed` a `pending`
   * solo si `refresh_after <= now()`. Es el "solo lo que toca" del Modo B.
   */
  async rearmDueTasks(source?: string): Promise<number> {
    const result = await db.execute(sql`
      UPDATE ingest.task
      SET status = 'pending', scheduled_at = now(), updated_at = now()
      WHERE status = 'completed' AND refresh_after IS NOT NULL
        AND refresh_after <= now() ${sourceFilter(source)}
    `)
    return result.rowCount ?? 0
  },

  async getExistingEntityIds(source: string): Promise<Set<string>> {
    const rows = await db
      .select({ entityId: ingestTask.entityId })
      .from(ingestTask)
      .where(eq(ingestTask.source, source))
    return new Set(rows.map((r) => r.entityId))
  },

  /**
   * Marca tareas `skipped`: les falta una dependencia, así que no consumen
   * reintentos ni acaban en dead_letter. `rearmSkippedTasks` las devuelve a
   * `pending` en la siguiente corrida (self-healing).
   */
  async skipTasks(taskIds: number[], reason: string): Promise<number> {
    if (taskIds.length === 0) return 0
    const result = await db
      .update(ingestTask)
      .set({
        status: 'skipped',
        skipReason: reason,
        leasedUntil: null,
        updatedAt: sql`now()`,
      })
      .where(inArray(ingestTask.id, taskIds))
      .returning({ id: ingestTask.id })
    return result.length
  },

  /**
   * Devuelve a `pending` las tareas claimadas que no se ejecutaron (deadline de
   * la corrida). No consumen intento: se decrementa el `attempts` que sumó el
   * claim, porque el fetch ni siquiera empezó.
   */
  async releaseTasks(taskIds: number[]): Promise<number> {
    if (taskIds.length === 0) return 0
    const result = await db.execute(sql`
      UPDATE ingest.task
      SET status = 'pending',
          leased_until = NULL,
          scheduled_at = now(),
          attempts = greatest(attempts - 1, 0),
          updated_at = now()
      WHERE id IN (${idList(taskIds)}) AND status = 'in_progress'
    `)
    return result.rowCount ?? 0
  },

  /**
   * Re-encola `dead_letter` por causas **transitorias** (timeout, conexión,
   * bloqueo, rate limit, lease): no son huecos reales y no deben quedarse
   * muertas tras una caída de la fuente.
   */
  async requeueTransientDeadLetters(limit = 5000): Promise<number> {
    const result = await db.execute(sql`
      UPDATE ingest.task
      SET status = 'pending', scheduled_at = now(), attempts = 0,
          leased_until = NULL, updated_at = now()
      WHERE id IN (
        SELECT id FROM ingest.task
        WHERE status = 'dead_letter'
          AND last_error ~* '(timeout|timed out|ECONN|socket|blocked|rate.?limit|lease|fetch failed|network)'
        ORDER BY updated_at ASC
        LIMIT ${limit}
      )
    `)
    return result.rowCount ?? 0
  },

  /** Re-arma lo `skipped`: la dependencia pudo aparecer en la corrida anterior. */
  async rearmSkippedTasks(source?: string): Promise<number> {
    // Backoff de 6 h: sin esto, un `skipped` por dependencia inexistente se
    // re-armaba en **cada** tick (claim → skip → claim) y quemaba cuota.
    const result = await db.execute(sql`
      UPDATE ingest.task
      SET status = 'pending', scheduled_at = now(), updated_at = now()
      WHERE status = 'skipped'
        AND updated_at < now() - interval '6 hours'
        ${sourceFilter(source)}
    `)
    return result.rowCount ?? 0
  },

  /**
   * Re-encola las tareas de episodios con su `kitsu_id` corregido.
   *
   * Tras reparar un mapping, lo derivado quedó apuntando a otra serie: la tarea
   * se re-arma con el payload nuevo (o se marca `skipped` si el anime no está
   * en Kitsu). No se crean tareas: se reusan las del `anime_episodes_{id}`.
   */
  async rearmEpisodeTasks(
    items: { animeId: number; kitsuId: number | null }[]
  ): Promise<number> {
    if (items.length === 0) return 0
    let touched = 0
    for (const batch of chunkArray(items, 500)) {
      const values = sql.join(
        batch.map(
          (i) =>
            sql`(${`anime_episodes_${i.animeId}`}::text, ${JSON.stringify({ kitsu_id: i.kitsuId, anime_id: i.animeId })}::jsonb, ${
              i.kitsuId === null ? 'skipped' : 'pending'
            }::text, ${i.kitsuId === null ? 'missing:kitsu_id' : null}::text)`
        ),
        sql`, `
      )
      const result = await db.execute(sql`
        UPDATE ingest.task AS t
        SET payload = v.payload,
            status = v.status,
            skip_reason = v.skip_reason,
            attempts = 0,
            last_error = NULL,
            leased_until = NULL,
            scheduled_at = now(),
            updated_at = now()
        FROM (VALUES ${values}) AS v(entity_id, payload, status, skip_reason)
        WHERE t.source = 'animeEpisodes' AND t.entity_id = v.entity_id
      `)
      touched += result.rowCount ?? 0
    }
    return touched
  },

  /**
   * Re-encola artworks de TVDB con el `tvdb_id` corregido.
   *
   * Dos pasos: (1) las tareas que ya existen para ese anime se renombran al
   * nuevo `entity_id` y vuelven a `pending`; (2) las que no existían se crean
   * (el initializer solo sembró las que había en su momento). El índice único
   * `(source, task_type, entity_id)` se respeta: si el `tvdb_id` nuevo ya tiene
   * tarea, esa sirve (misma serie ⇒ mismos artworks).
   */
  async rearmTvdbArtworkTasks(
    items: { animeId: number; tvdbId: number | null }[]
  ): Promise<number> {
    const withId = items.filter(
      (i): i is { animeId: number; tvdbId: number } => i.tvdbId !== null
    )
    if (withId.length === 0) return 0

    let touched = 0
    for (const batch of chunkArray(withId, 500)) {
      const values = sql.join(
        batch.map(
          (i) =>
            sql`(${i.tvdbId}::int, ${i.animeId}::int, ${`tvdb_artworks_${i.tvdbId}`}::text, ${JSON.stringify(
              { tvdb_id: i.tvdbId, anime_id: i.animeId }
            )}::jsonb)`
        ),
        sql`, `
      )

      const updated = await db.execute(sql`
        UPDATE ingest.task AS t
        SET entity_id = v.entity_id,
            payload = v.payload,
            status = 'pending',
            skip_reason = NULL,
            attempts = 0,
            last_error = NULL,
            leased_until = NULL,
            scheduled_at = now(),
            updated_at = now()
        FROM (VALUES ${values}) AS v(tvdb_id, anime_id, entity_id, payload)
        WHERE t.source = 'tvdbSeriesArtworks'
          AND t.payload->>'anime_id' = v.anime_id::text
          AND NOT EXISTS (
            SELECT 1 FROM ingest.task x
            WHERE x.source = 'tvdbSeriesArtworks'
              AND x.entity_id = v.entity_id
              AND x.id <> t.id
          )
      `)
      touched += updated.rowCount ?? 0

      const inserted = await db.execute(sql`
        INSERT INTO ingest.task (source, task_type, entity_id, payload, priority, status)
        SELECT 'tvdbSeriesArtworks', 'tvdb_series_artworks', v.entity_id, v.payload, 5, 'pending'
        FROM (VALUES ${values}) AS v(tvdb_id, anime_id, entity_id, payload)
        WHERE NOT EXISTS (
          SELECT 1 FROM ingest.task x
          WHERE x.source = 'tvdbSeriesArtworks' AND x.entity_id = v.entity_id
        )
        ON CONFLICT (source, task_type, entity_id) DO NOTHING
      `)
      touched += inserted.rowCount ?? 0
    }
    return touched
  },

  /**
   * Política de refresh del taskType. `ingest.task_policy` manda (es dato
   * editable); si no hay fila se usa `REFRESH_POLICY` (código) y, si tampoco
   * existe, **nunca** se refresca (evita re-barridos accidentales).
   */
  async refreshPolicyFor(
    source: string,
    taskType: string
  ): Promise<RefreshPolicy> {
    const rows = await db
      .select({
        cold: ingestTaskPolicy.refreshIntervalSeconds,
        hot: ingestTaskPolicy.refreshIntervalAiringSeconds,
      })
      .from(ingestTaskPolicy)
      .where(
        and(
          eq(ingestTaskPolicy.source, source),
          eq(ingestTaskPolicy.taskType, taskType)
        )
      )
      .limit(1)

    const row = rows[0]
    if (row) return { cold: row.cold ?? null, hot: row.hot ?? null }
    return REFRESH_POLICY[taskType] ?? { cold: null, hot: null }
  },

  /**
   * Hot set del Modo B: anime cuyo estado puede cambiar en las próximas horas.
   *
   * Incluye una **ventana de cierre** de 7 días tras `aired_to`: es lo que
   * garantiza la pasada final de detalles/episodios cuando la temporada
   * termina, sin volver a tocar el catálogo terminado.
   */
  async hotAnimeIds(): Promise<Set<number>> {
    const rows = await db.execute(sql`
      SELECT mal_id FROM anime
      WHERE status = 'Currently Airing'
         OR (status = 'Not yet aired'
             AND (aired_from IS NULL OR aired_from <= now() + interval '30 days'))
         OR (aired_to IS NOT NULL AND aired_to >= now() - interval '7 days')
    `)
    return new Set(
      (rows.rows as unknown as { mal_id: number }[]).map((r) => r.mal_id)
    )
  },

  /** Abre una fila en `ingest.run` y devuelve su id. */
  async startRun(
    source: string,
    mode: string,
    notes?: Record<string, unknown>
  ): Promise<number> {
    const rows = await db
      .insert(ingestRun)
      .values({ source, mode, notes: notes ? JSON.stringify(notes) : null })
      .returning({ id: ingestRun.id })
    return rows[0]!.id
  },

  /** Cierra la corrida con sus contadores. */
  async finishRun(
    id: number,
    counts: {
      processed: number
      retried: number
      blocked: number
      deadLettered: number
      notes?: Record<string, unknown>
    }
  ): Promise<void> {
    await db
      .update(ingestRun)
      .set({
        finishedAt: sql`now()`,
        tasksProcessed: counts.processed,
        tasksRetried: counts.retried,
        tasksBlocked: counts.blocked,
        tasksDeadLettered: counts.deadLettered,
        notes: counts.notes ? JSON.stringify(counts.notes) : null,
      })
      .where(eq(ingestRun.id, id))
  },

  /** Últimas corridas (para /stats y el healthcheck). */
  async recentRuns(limit = 20) {
    return await db
      .select()
      .from(ingestRun)
      .orderBy(sql`started_at DESC`)
      .limit(limit)
  },

  /** Conteo por fuente/tipo/estado (para /stats). */
  async statsByType(): Promise<
    { source: string; taskType: string; status: string; count: number }[]
  > {
    const rows = await db
      .select({
        source: ingestTask.source,
        taskType: ingestTask.taskType,
        status: ingestTask.status,
        count: sql<number>`count(*)::int`,
      })
      .from(ingestTask)
      .groupBy(ingestTask.source, ingestTask.taskType, ingestTask.status)
    return rows
  },

  /** Tareas vencidas ahora (sin re-armarlas), por tipo. */
  async dueByType(): Promise<{ taskType: string; count: number }[]> {
    const rows = await db.execute(sql`
      SELECT task_type, count(*)::int AS count
      FROM ingest.task
      WHERE status = 'completed' AND refresh_after IS NOT NULL
        AND refresh_after <= now()
      GROUP BY 1 ORDER BY 2 DESC
    `)
    return rows.rows as unknown as { taskType: string; count: number }[]
  },

  /** Métricas por estado (salud de la cola), con los estados en 0 incluidos. */
  async stats(source?: string): Promise<Record<string, number>> {
    const rows = await db
      .select({
        status: ingestTask.status,
        count: sql<number>`count(*)::int`,
      })
      .from(ingestTask)
      .where(source ? eq(ingestTask.source, source) : undefined)
      .groupBy(ingestTask.status)

    const counts: Record<string, number> = Object.fromEntries(
      TASK_STATUSES.map((status) => [status, 0])
    )
    for (const row of rows) counts[row.status] = row.count
    return counts
  },
}
