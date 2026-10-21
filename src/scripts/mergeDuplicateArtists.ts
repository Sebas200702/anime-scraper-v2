/**
 * Fusiona los artistas que solo difieren en mayúsculas/minúsculas.
 *
 * MAL, ANN y AnimeThemes escriben el nombre del intérprete con distinta
 * capitalización ("Nobodyknows+" / "nobodyknows+") y el índice único de
 * `artist` es sobre el nombre exacto: quedaban dos filas para el mismo
 * artista y los créditos se veían duplicados en la API.
 *
 * Se conserva la fila que tenga `mal_id` (o la más antigua) y se repuntan sus
 * créditos; los que chocan con la clave primaria `(music_id, artist_id)` se
 * borran (eran el mismo vínculo).
 *
 * Uso: bun run artists:merge-duplicates
 */
import { db } from '../libs/db.js'

const main = async () => {
  const groups = (
    await db.execute(`
      SELECT lower(trim(name)) AS k,
             array_agg(id ORDER BY id) AS ids
      FROM artist
      GROUP BY 1
      HAVING count(*) > 1
    `)
  ).rows as unknown as { k: string; ids: number[] }[]

  console.log(
    `grupos con duplicados por normalización: ${groups.length} ` +
      `(${groups.reduce((n, g) => n + g.ids.length - 1, 0)} artistas de sobra)`
  )

  let removed = 0
  for (const group of groups) {
    const info = (
      await db.execute(
        `SELECT id, mal_id FROM artist WHERE id = ANY(ARRAY[${group.ids.join(',')}])`
      )
    ).rows as unknown as { id: number; mal_id: number | null }[]

    const keep = (info.find((a) => a.mal_id !== null) ?? info[0])?.id
    if (keep === undefined) continue
    const drop = info.filter((a) => a.id !== keep).map((a) => a.id)
    if (drop.length === 0) continue

    // Dos pasos. Primero se borran los créditos que sobran: los que chocan
    // con un vínculo ya existente hacia la fila conservada **y** los
    // duplicados entre las propias filas a fusionar (varias filas del mismo
    // anime apuntando al mismo artista: al repuntarlas todas al mismo id,
    // la segunda violaría la clave primaria `(music_id, artist_id)`).
    await db.execute(`
      WITH pairs(keep_id, drop_id) AS (
        VALUES ${drop.map((id) => `(${keep}::int, ${id}::int)`).join(', ')}
      )
      DELETE FROM music_artist ma
      USING pairs
      WHERE ma.artist_id = pairs.drop_id
        AND (
          EXISTS (
            SELECT 1 FROM music_artist x
            WHERE x.music_id = ma.music_id AND x.artist_id = pairs.keep_id
          )
          OR EXISTS (
            SELECT 1 FROM music_artist y
            JOIN pairs p2 ON y.artist_id = p2.drop_id
            WHERE y.music_id = ma.music_id AND y.artist_id < ma.artist_id
          )
        )
    `)
    await db.execute(
      `UPDATE music_artist SET artist_id = ${keep} WHERE artist_id = ANY(ARRAY[${drop.join(',')}])`
    )
    await db.execute(
      `DELETE FROM artist WHERE id = ANY(ARRAY[${drop.join(',')}])`
    )
    removed += drop.length
  }

  const total = (await db.execute('SELECT count(*)::int AS c FROM artist'))
    .rows[0] as unknown as { c: number }
  console.log(
    `✓ ${removed} artistas duplicados fusionados · artistas totales: ${total.c}`
  )
  process.exit(0)
}

await main()
