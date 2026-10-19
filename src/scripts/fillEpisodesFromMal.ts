/**
 * Rellena las listas de episodios que faltan con el **número de episodios** que
 * publica MAL.
 *
 * MAL no tiene tabla de episodios: su ficha y su API solo dan la **cantidad**
 * (`num_episodes`). Para los animes sin lista (Kitsu no los tiene: 9.047 no
 * existen en Kitsu y 1.565 no publican episodios) sí se puede reconstruir el
 * listado con sus números: la fila existe, el número es real y el título se
 * deja como marcador (`Episode N`) porque no hay fuente para el título.
 *
 * Idempotente: solo crea los números que faltan.
 *
 * Uso: bun run episodes:fill-from-mal
 */
import { db } from '../libs/db.js'

const main = async () => {
  const targets = (
    await db.execute(`
      SELECT a.mal_id, a.episodes, (
        SELECT count(*) FROM episode e WHERE e.anime_id = a.mal_id
      ) AS current
      FROM anime a
      WHERE a.episodes IS NOT NULL AND a.episodes > 0
        AND (SELECT count(*) FROM episode e WHERE e.anime_id = a.mal_id) < a.episodes
      ORDER BY a.mal_id
    `)
  ).rows as unknown as { mal_id: number; episodes: number; current: number }[]

  console.log(
    `animes con lista incompleta: ${targets.length} ` +
      `(faltan ${targets.reduce((n, t) => n + (t.episodes - t.current), 0)} episodios)`
  )

  let created = 0
  for (let i = 0; i < targets.length; i += 200) {
    const batch = targets.slice(i, i + 200)
    // Valores en línea: enteros y un título propio (sin inyección posible).
    const values: string[] = []
    for (const target of batch) {
      for (let n = target.current + 1; n <= target.episodes; n++) {
        values.push(`(${target.mal_id}::int, ${n}::int, 'Episode ${n}'::text)`)
      }
    }
    if (values.length === 0) continue
    const res = await db.execute(`
      INSERT INTO episode (anime_id, number, title)
      SELECT v.anime_id, v.number, v.title
      FROM (VALUES ${values.join(', ')}) AS v(anime_id, number, title)
      ON CONFLICT (anime_id, number) DO NOTHING
    `)
    created += res.rowCount ?? 0
  }

  const counts = await db.execute(`
    SELECT
      (SELECT count(*) FROM episode) AS episodios,
      (SELECT count(DISTINCT anime_id) FROM episode) AS animes
  `)
  console.log(
    `✓ ${created} episodios creados · ` +
      JSON.stringify(counts.rows[0] as Record<string, number>)
  )
  process.exit(0)
}

await main()
