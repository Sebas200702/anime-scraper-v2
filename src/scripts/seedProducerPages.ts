/**
 * Siembra one-off las páginas de productores/estudios de Jikan.
 *
 *   bun run db:seed-producer-pages            # usa el total de Jikan (o el cursor local)
 *   bun run db:seed-producer-pages --pages=140
 *
 * Por qué existe: el generador incremental de `jikan` solo crea las **últimas**
 * páginas (cursor `MAX(mal_id)`); los ~3.000 productores ya existían pero sus
 * páginas nunca se pidieron con el mapper actual. Es la única fuente del
 * `producer_media` (`media_type = 'logo'`) y de `about`/`established`.
 *
 * Idempotente: no duplica tareas existentes. Se puede correr aunque Jikan esté
 * caído (cae al cursor local); las tareas quedan `pending` y las drena el
 * discovery cuando la API vuelva.
 */
import { sql } from 'drizzle-orm'
import { closeDb, db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'
import { fetchProducerPage } from '../services/jikan.js'

const args = process.argv.slice(2)
const pagesArg = args.find((arg) => arg.startsWith('--pages='))?.split('=')[1]

const main = async () => {
  const existing = await taskRepository.getExistingEntityIds('jikan')

  let totalPages: number
  let perPage = 25

  if (Number(pagesArg) > 0) {
    totalPages = Number(pagesArg)
    console.log(`Páginas forzadas: ${totalPages}`)
  } else {
    try {
      const first = await fetchProducerPage(1)
      perPage = first.pagination.items.per_page || 25
      totalPages = Math.ceil(first.pagination.items.total / perPage)
      console.log(
        `Jikan: ${first.pagination.items.total} productores, ${perPage}/página → ${totalPages} páginas`
      )
    } catch (error) {
      // Sin Jikan no hay total: se usa el id máximo conocido como cota.
      const row = await db.execute(
        sql`SELECT coalesce(max(mal_id), 0)::int AS max_id FROM producer`
      )
      const maxId = (row.rows[0] as { max_id: number } | undefined)?.max_id ?? 0
      totalPages = Math.ceil(maxId / perPage) + 2
      console.log(
        `Jikan no disponible (${(error as Error).message}); cursor local max_id=${maxId} → ${totalPages} páginas`
      )
    }
  }

  const tasks = []
  for (let page = 1; page <= totalPages; page++) {
    const entityId = `producer_${page}`
    if (existing.has(entityId)) continue
    tasks.push({
      source: 'jikan',
      entityId,
      taskType: 'producer_page_hydration',
      priority: 5,
      status: 'pending' as const,
      payload: { page },
    })
  }

  for (let i = 0; i < tasks.length; i += 1000) {
    await taskRepository.createManyTasks(tasks.slice(i, i + 1000))
  }

  console.log(
    `✓ ${tasks.length} tareas de páginas de productor creadas (${existing.size} jikan ya existían)`
  )
}

try {
  await main()
} catch (error) {
  console.error('Fatal seedProducerPages:', error)
  process.exitCode = 1
} finally {
  await closeDb()
}
