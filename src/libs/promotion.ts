/**
 * Promoción Modo A → prod: diff-upsert por clave de identidad, en orden
 * FK-safe, dentro de una transacción.
 *
 * Propiedades (las que pide el Track D):
 * - **Solo escribe lo que cambió**: `ON CONFLICT … DO UPDATE … WHERE (cols) IS
 *   DISTINCT FROM (excluded.cols)`, así que re-ejecutar es un no-op y las filas
 *   idénticas no se tocan (los contadores salen de ahí, con `xmax = 0`).
 * - **Orden padres → hijos** y transacción única: si algo rompe, rollback.
 * - **Remap de ids surrogate** (`artist.id`, `episode.id`): su identidad real es
 *   la clave natural, así que las FKs de los hijos se reescriben al id del
 *   destino.
 * - **Nunca borra**: solo inserta y actualiza.
 * - `dryRun` ejecuta todo y hace ROLLBACK (validación previa sin efectos).
 */
import type { Pool } from 'pg'

export interface RemapPlan {
  /** Columna en la tabla hija que hay que reescribir. */
  column: string
  /** Tabla padre (mismo nombre en ambos lados). */
  parent: string
  /** Clave natural que empareja filas entre origen y destino. */
  parentKey: string[]
}

export interface PromotionPlan {
  table: string
  /**
   * `upsert` requiere clave única en el destino (`ON CONFLICT`); las tablas de
   * media no la tienen en el DDL de anidev, así que van como `insert-missing`.
   */
  strategy: 'upsert' | 'insert-missing'
  /** Columnas de identidad (target del ON CONFLICT o clave natural). */
  key: string[]
  remaps?: RemapPlan[]
  /**
   * El `id` es surrogate (no identidad): no se copia del origen y lo asigna el
   * destino. Copiarlo chocaría con ids ya usados allí; los hijos se reconectan
   * con `remaps` por clave natural.
   */
  surrogateId?: boolean
}

/**
 * Orden FK-safe de lo que escribe el scraper. Los padres van antes que sus
 * hijos; las junction y la media al final de cada rama.
 */
export const PROMOTION_PLAN: PromotionPlan[] = [
  // 1. Taxonomía (padres sin FK)
  { table: 'genre', strategy: 'upsert', key: ['mal_id'] },
  { table: 'theme', strategy: 'upsert', key: ['mal_id'] },
  { table: 'demographic', strategy: 'upsert', key: ['mal_id'] },

  // 2. Compañías
  { table: 'producer', strategy: 'upsert', key: ['mal_id'] },
  {
    table: 'producer_title',
    strategy: 'upsert',
    key: ['producer_id', 'title'],
  },

  // 3. Anime y sus satélites
  { table: 'anime', strategy: 'upsert', key: ['mal_id'] },
  {
    table: 'anime_title_synonym',
    strategy: 'upsert',
    key: ['anime_id', 'title'],
  },
  { table: 'anime_external_ids', strategy: 'upsert', key: ['anime_id'] },
  {
    table: 'anime_media',
    strategy: 'insert-missing',
    key: ['anime_id', 'media_type', 'src'],
  },

  // 4. Personas
  { table: 'character', strategy: 'upsert', key: ['mal_id'] },
  {
    table: 'character_nickname',
    strategy: 'upsert',
    key: ['character_id', 'nickname'],
  },
  {
    table: 'character_media',
    strategy: 'insert-missing',
    key: ['character_id', 'media_type', 'src'],
  },
  { table: 'staff', strategy: 'upsert', key: ['mal_id'] },
  {
    table: 'staff_alternative_name',
    strategy: 'upsert',
    key: ['staff_id', 'name'],
  },
  {
    table: 'staff_media',
    strategy: 'insert-missing',
    key: ['staff_id', 'media_type', 'src'],
  },

  // 5. Artistas (id surrogate: se remapea por nombre) y música
  { table: 'artist', strategy: 'upsert', surrogateId: true, key: ['name'] },
  { table: 'music', strategy: 'upsert', key: ['id'] },
  {
    table: 'music_version',
    strategy: 'upsert',
    key: ['version_id'],
  },
  {
    table: 'music_resolution',
    strategy: 'upsert',
    key: ['song_id', 'resolution'],
  },
  {
    table: 'music_artist',
    strategy: 'upsert',
    key: ['music_id', 'artist_id'],
    remaps: [{ column: 'artist_id', parent: 'artist', parentKey: ['name'] }],
  },
  {
    table: 'music_media',
    strategy: 'insert-missing',
    key: ['music_id', 'media_type', 'src'],
  },

  // 6. Episodios (id surrogate: se remapea por (anime_id, number))
  {
    table: 'episode',
    strategy: 'upsert',
    key: ['anime_id', 'number'],
  },
  {
    table: 'episode_source',
    strategy: 'upsert',
    key: ['episode_id', 'src'],
    remaps: [
      {
        column: 'episode_id',
        parent: 'episode',
        parentKey: ['anime_id', 'number'],
      },
    ],
  },
  {
    table: 'episode_subtitle',
    strategy: 'upsert',
    key: ['episode_id', 'language', 'src'],
    remaps: [
      {
        column: 'episode_id',
        parent: 'episode',
        parentKey: ['anime_id', 'number'],
      },
    ],
  },
  {
    table: 'episode_media',
    strategy: 'insert-missing',
    key: ['episode_id', 'media_type', 'src'],
    remaps: [
      {
        column: 'episode_id',
        parent: 'episode',
        parentKey: ['anime_id', 'number'],
      },
    ],
  },

  // 7. Junctions anime (dependen de todo lo anterior)
  { table: 'anime_genre', strategy: 'upsert', key: ['anime_id', 'genre_id'] },
  { table: 'anime_theme', strategy: 'upsert', key: ['anime_id', 'theme_id'] },
  {
    table: 'anime_demographic',
    strategy: 'upsert',
    key: ['anime_id', 'demographic_id'],
  },
  {
    table: 'anime_producer',
    strategy: 'upsert',
    key: ['anime_id', 'producer_id', 'role'],
  },
  {
    table: 'anime_staff',
    strategy: 'upsert',
    key: ['anime_id', 'staff_id', 'role'],
  },
  {
    table: 'anime_character',
    strategy: 'upsert',
    key: ['anime_id', 'character_id', 'role'],
  },
  {
    table: 'anime_music',
    strategy: 'upsert',
    key: ['anime_id', 'music_id'],
  },
  {
    table: 'anime_relation',
    strategy: 'upsert',
    key: ['anime_id', 'relation_type', 'related_anime_id'],
  },
  {
    table: 'character_voice_actor',
    strategy: 'upsert',
    key: ['character_id', 'staff_id', 'language'],
  },
]

export interface TableReport {
  table: string
  read: number
  inserted: number
  updated: number
  unchanged: number
  skipped: number
}

export interface PromotionOptions {
  source: Pool
  target: Pool
  /** Ejecuta todo y hace ROLLBACK al final. */
  dryRun?: boolean
  batchSize?: number
  plan?: PromotionPlan[]
  onTable?: (report: TableReport) => void
  log?: (message: string) => void
}

export interface PromotionReport {
  dryRun: boolean
  tables: TableReport[]
}

const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

const columnsOf = async (pool: Pool, table: string): Promise<string[]> => {
  const { rows } = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  )
  return rows.map((row) => row.column_name)
}

const readTable = async (
  pool: Pool,
  table: string,
  columns: string[],
  key: string[],
  batchSize: number
): Promise<Record<string, unknown>[]> => {
  const order = key.map(quote).join(', ')
  const rows: Record<string, unknown>[] = []
  let offset = 0

  for (;;) {
    const { rows: page } = await pool.query(
      `SELECT ${columns.map(quote).join(', ')} FROM ${quote(table)}
       ORDER BY ${order} LIMIT $1 OFFSET $2`,
      [batchSize, offset]
    )
    if (page.length === 0) break
    rows.push(...page)
    if (page.length < batchSize) break
    offset += batchSize
  }

  return rows
}

/**
 * Mapa `id origen → id destino` de una tabla padre, emparejando por su clave
 * natural (los ids surrogate no coinciden entre DBs).
 */
const buildIdMap = async (
  source: Pool,
  target: { query: Pool['query'] },
  parent: string,
  parentKey: string[]
): Promise<Map<string, number>> => {
  const keys = parentKey.map(quote).join(', ')
  const [from, to] = await Promise.all([
    source.query(`SELECT id, ${keys} FROM ${quote(parent)}`),
    // Ojo: se lee por la MISMA sesión de la transacción; con el pool no se ven
    // las filas recién insertadas en esta promoción.
    target.query(`SELECT id, ${keys} FROM ${quote(parent)}`),
  ])

  const encode = (row: Record<string, unknown>) =>
    parentKey.map((key) => String(row[key])).join('\u0000')

  const targetIds = new Map<string, number>()
  for (const row of to.rows) targetIds.set(encode(row), Number(row.id))

  const map = new Map<string, number>()
  for (const row of from.rows) {
    const id = targetIds.get(encode(row))
    if (id !== undefined) map.set(String(row.id), id)
  }
  return map
}

const upsertBatch = async (
  client: { query: Pool['query'] },
  table: string,
  columns: string[],
  key: string[],
  rows: Record<string, unknown>[]
): Promise<{ inserted: number; updated: number }> => {
  if (rows.length === 0) return { inserted: 0, updated: 0 }

  const setColumns = columns.filter(
    (column) => !key.includes(column) && column !== 'id'
  )
  const values: unknown[] = []
  const tuples = rows.map((row) => {
    const placeholders = columns.map((column) => {
      values.push(row[column])
      return `$${values.length}`
    })
    return `(${placeholders.join(', ')})`
  })

  // Un null del origen es "desconocido", nunca "borrado": las fuentes añaden
  // conocimiento (el seed del dump offline es disperso por diseño) y un null
  // jamás puede pisar un valor que otra fuente ya aportó. Sin esto, promover
  // filas dispersas sobre filas ricas sería pérdida de datos.
  const setClause = setColumns
    .map(
      (c) =>
        `${quote(c)} = COALESCE(excluded.${quote(c)}, ${quote(table)}.${quote(c)})`
    )
    .join(', ')
  const changedPredicate =
    setColumns.length > 0
      ? `WHERE (${setColumns.map((c) => `${quote(table)}.${quote(c)}`).join(', ')})
              IS DISTINCT FROM (${setColumns.map((c) => `excluded.${quote(c)}`).join(', ')})`
      : ''

  const sql = `
    INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')})
    VALUES ${tuples.join(', ')}
    ON CONFLICT (${key.map(quote).join(', ')})
    ${
      setColumns.length > 0
        ? `DO UPDATE SET ${setClause}
           ${changedPredicate}`
        : 'DO NOTHING'
    }
    RETURNING (xmax = 0) AS inserted`

  const { rows: result } = await client.query<{ inserted: boolean }>(
    sql,
    values
  )
  return {
    inserted: result.filter((row) => row.inserted).length,
    updated: result.filter((row) => !row.inserted).length,
  }
}

const insertMissingBatch = async (
  client: { query: Pool['query'] },
  table: string,
  columns: string[],
  key: string[],
  rows: Record<string, unknown>[]
): Promise<{ inserted: number; skipped: number }> => {
  if (rows.length === 0) return { inserted: 0, skipped: 0 }

  // Sin índice único no hay ON CONFLICT: se pregunta al destino por la clave
  // natural de este lote y se inserta solo lo que falta.
  const keyList = key.map(quote).join(', ')
  const existing = await client.query(
    `SELECT ${keyList} FROM ${quote(table)}
     WHERE (${keyList}) IN (${rows
       .map(
         (_, index) =>
           `(${key.map((__, i) => `$${index * key.length + i + 1}`).join(', ')})`
       )
       .join(', ')})`,
    rows.flatMap((row) => key.map((column) => row[column]))
  )

  const encode = (row: Record<string, unknown>) =>
    key.map((column) => String(row[column])).join('\u0000')
  const present = new Set(
    existing.rows.map((row: Record<string, unknown>) => encode(row))
  )

  // El origen puede traer la misma clave repetida (p. ej. media duplicada antes
  // de tener índice único local): se dedupe antes de insertar, o el lote choca
  // contra el índice único del destino.
  const seen = new Set<string>()
  const missing = rows.filter((row) => {
    const id = encode(row)
    if (present.has(id) || seen.has(id)) return false
    seen.add(id)
    return true
  })
  if (missing.length === 0) return { inserted: 0, skipped: rows.length }

  const values: unknown[] = []
  const tuples = missing.map((row) => {
    const placeholders = columns.map((column) => {
      values.push(row[column])
      return `$${values.length}`
    })
    return `(${placeholders.join(', ')})`
  })

  const { rows: inserted } = await client.query(
    `INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')})
     VALUES ${tuples.join(', ')} RETURNING id`,
    values
  )

  return { inserted: inserted.length, skipped: rows.length - inserted.length }
}

/**
 * Resincroniza las secuencias de las tablas con `id` serial tras copiar filas
 * con id explícito. Sin esto, el próximo insert del origen choca con el PK y —
 * si usa `ON CONFLICT DO NOTHING` — se pierde en silencio.
 */
export const resyncSequences = async (
  client: { query: Pool['query'] },
  plan: PromotionPlan[]
): Promise<string[]> => {
  const resynced: string[] = []
  for (const entry of plan) {
    try {
      const { rows } = await client.query<{ name: string | null }>(
        `SELECT pg_get_serial_sequence($1, 'id') AS name`,
        [entry.table]
      )
      const sequence = rows[0]?.name
      if (!sequence) continue
      await client.query(
        `SELECT setval($1, COALESCE((SELECT max(id) FROM ${quote(entry.table)}), 1))`,
        [sequence]
      )
      resynced.push(entry.table)
    } catch {
      // Tabla sin id/seq: se ignora.
    }
  }
  return resynced
}

export const promote = async ({
  source,
  target,
  dryRun = false,
  batchSize = 500,
  plan = PROMOTION_PLAN,
  onTable,
  log = () => {},
}: PromotionOptions): Promise<PromotionReport> => {
  const client = await target.connect()
  const reports: TableReport[] = []
  const idMaps = new Map<string, Map<string, number>>()

  try {
    await client.query('BEGIN')

    for (const entry of plan) {
      log(`▶ ${entry.table}`)
      const columns = (await columnsOf(target, entry.table)).filter(
        (column) => !(entry.surrogateId && column === 'id')
      )

      // Remaps: el id del padre en destino, emparejando por clave natural.
      const remapColumns = entry.remaps ?? []
      for (const remap of remapColumns) {
        const cacheKey = `${remap.parent}:${remap.parentKey.join(',')}`
        if (!idMaps.has(cacheKey)) {
          idMaps.set(
            cacheKey,
            await buildIdMap(source, client, remap.parent, remap.parentKey)
          )
        }
      }

      const sourceRows = await readTable(
        source,
        entry.table,
        columns,
        entry.key,
        batchSize
      )

      // Si falta el mapa de un padre (p. ej. no está en destino), la fila hija
      // no puede promoverse: se cuenta como omitida en vez de romper la FK.
      const usable: Record<string, unknown>[] = []
      let unmapped = 0

      for (const row of sourceRows) {
        let ok = true
        const copy: Record<string, unknown> = { ...row }

        for (const remap of remapColumns) {
          const cacheKey = `${remap.parent}:${remap.parentKey.join(',')}`
          const map = idMaps.get(cacheKey)
          const mapped = map?.get(String(row[remap.column]))
          if (mapped === undefined) {
            ok = false
            break
          }
          copy[remap.column] = mapped
        }

        if (ok) usable.push(copy)
        else unmapped++
      }

      let inserted = 0
      let updated = 0

      for (const [index, batch] of chunk(usable, batchSize).entries()) {
        try {
          if (entry.strategy === 'upsert') {
            const result = await upsertBatch(
              client,
              entry.table,
              columns,
              entry.key,
              batch
            )
            inserted += result.inserted
            updated += result.updated
          } else {
            const result = await insertMissingBatch(
              client,
              entry.table,
              columns,
              entry.key,
              batch
            )
            inserted += result.inserted
          }
        } catch (error) {
          // Contexto para que un fallo de promoción diga qué tabla/lote rompió.
          throw new Error(
            `Promoción de "${entry.table}" falló (lote ${index}, ${batch.length} filas): ${(error as Error).message}`
          )
        }
      }

      const report: TableReport = {
        table: entry.table,
        read: sourceRows.length,
        inserted,
        updated,
        unchanged: usable.length - inserted - updated,
        skipped: unmapped,
      }
      reports.push(report)
      onTable?.(report)
      log(
        `${entry.table.padEnd(24)} leídas ${report.read
          .toString()
          .padStart(
            6
          )} · +${report.inserted} ~${report.updated} =${report.unchanged}${
          report.skipped > 0 ? ` omitidas ${report.skipped}` : ''
        }`
      )
    }

    if (dryRun) {
      await client.query('ROLLBACK')
      log('\n(dry-run) ROLLBACK: no se escribió nada')
    } else {
      await client.query('COMMIT')
      // Las tablas con `id` serial reciben filas CON id explícito (se copia del
      // origen): la secuencia queda atrás y **todo insert nuevo choca con el PK**
      // (y con `ON CONFLICT DO NOTHING` se descarta en silencio). Se resincroniza.
      const resynced = await resyncSequences(client, plan)
      log(`🔢 Secuencias resincronizadas: ${resynced.join(', ') || 'ninguna'}`)
    }

    return { dryRun, tables: reports }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
