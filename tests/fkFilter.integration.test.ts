import { afterAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { db } from '../src/libs/db.js'
import { anime } from '../src/schemas/anime.js'
import { takeDeferredDependencies } from '../src/shared/dependencyTracker.js'
import { filterByExistingFk } from '../src/shared/fkFilter.js'

/**
 * El filtro de FK ya no descarta en silencio: avisa al manager de las filas
 * difredas para que la tarea se marque `skipped` (P3) en vez de perder la
 * relación para siempre.
 */
const RUN = Boolean(process.env.RUN_DB_TESTS)
const PRESENT = 997001
const MISSING = 997999

const cleanup = async () => {
  await db.execute(sql`DELETE FROM anime WHERE mal_id = ${PRESENT}`)
}

describe.skipIf(!RUN)('filtro de FK y dependencias diferidas', () => {
  afterAll(cleanup)

  test('devuelve solo lo que existe y avisa de lo diferido', async () => {
    await cleanup()
    await db.execute(
      sql`INSERT INTO anime (mal_id, title) VALUES (${PRESENT}, 'FK Filter Test')`
    )
    takeDeferredDependencies() // reset del contador del lote

    const items = [
      { animeId: PRESENT },
      { animeId: MISSING },
      { animeId: MISSING },
    ]
    const valid = await filterByExistingFk(
      items,
      (item) => item.animeId,
      anime,
      anime.malId
    )

    expect(valid).toEqual([{ animeId: PRESENT }])
    expect(takeDeferredDependencies()).toBe(2)
    // el contador se consume (no se arrastra al lote siguiente)
    expect(takeDeferredDependencies()).toBe(0)
  })
})
