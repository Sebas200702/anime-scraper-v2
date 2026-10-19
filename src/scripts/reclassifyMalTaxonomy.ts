/**
 * Re-clasifica la taxonomía MAL ya guardada usando `shared/malTaxonomy.ts`.
 *
 * Antes de tener el mapa, todo lo que MAL devuelve en `genres` (géneros, temas
 * y demográficas mezclados) se guardaba como **género**. Esto mueve los temas y
 * las demográficas a sus tablas y junctions, **sin volver a pedir nada**: los
 * ids de MAL son los mismos, así que es un `INSERT ... SELECT` + `DELETE`.
 *
 * Idempotente: re-ejecutarlo no duplica ni rompe nada.
 *
 *   bun run taxonomy:reclassify
 */
import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { malTaxonomyIds } from '../shared/malTaxonomy.js'

const move = async (
  kind: 'theme' | 'demographic',
  ids: number[]
): Promise<{ moved: number; junction: number }> => {
  if (ids.length === 0) return { moved: 0, junction: 0 }
  const idList = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `
  )

  // 1) Lookup: copia la fila (id + nombre) a su tabla correcta.
  const lookup = await db.execute(sql`
    INSERT INTO ${sql.raw(kind)} (mal_id, name)
    SELECT mal_id, name FROM genre WHERE mal_id IN (${idList})
    ON CONFLICT (mal_id) DO NOTHING
  `)

  // 2) Junction: mueve los vínculos al par correcto.
  const junction = await db.execute(sql`
    INSERT INTO ${sql.raw(`anime_${kind}`)} (anime_id, ${sql.raw(`${kind}_id`)})
    SELECT anime_id, genre_id FROM anime_genre WHERE genre_id IN (${idList})
    ON CONFLICT DO NOTHING
  `)

  // 3) Limpia el género mal clasificado (primero la junction, luego la fila).
  await db.execute(sql`
    DELETE FROM anime_genre WHERE genre_id IN (${idList})
  `)
  await db.execute(sql`
    DELETE FROM genre WHERE mal_id IN (${idList})
  `)

  return {
    moved: lookup.rowCount ?? 0,
    junction: junction.rowCount ?? 0,
  }
}

const themes = await move('theme', malTaxonomyIds('theme'))
const demographics = await move('demographic', malTaxonomyIds('demographic'))

console.log(
  `✓ temas: ${themes.moved} filas de lookup, ${themes.junction} vínculos`
)
console.log(
  `✓ demográficas: ${demographics.moved} filas de lookup, ${demographics.junction} vínculos`
)
process.exit(0)
