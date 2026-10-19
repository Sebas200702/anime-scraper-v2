/**
 * Limpia los géneros mal clasificados.
 *
 * Antes de tener la taxonomía exacta, la clasificación salía de un mapa global
 * (72 ids) construido con 220 fichas: los ids que no estaban en el mapa se
 * trataban como género. Con la barra lateral de la ficha HTML ya sabemos qué es
 * qué, así que los junctions de `anime_genre` que en realidad son un tema o
 * una demográfica sobran.
 *
 * Uso: bun run taxonomy:cleanup
 */
import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'

const main = async () => {
  const genres = await db.execute(sql`
    DELETE FROM anime_genre ag
    WHERE EXISTS (
      SELECT 1 FROM anime_theme at
      WHERE at.anime_id = ag.anime_id AND at.theme_id = ag.genre_id
    ) OR EXISTS (
      SELECT 1 FROM anime_demographic ad
      WHERE ad.anime_id = ag.anime_id AND ad.demographic_id = ag.genre_id
    )
  `)

  const themes = await db.execute(sql`
    DELETE FROM anime_theme at
    WHERE EXISTS (
      SELECT 1 FROM anime_genre ag
      WHERE ag.anime_id = at.anime_id AND ag.genre_id = at.theme_id
    ) AND NOT EXISTS (
      SELECT 1 FROM anime_demographic ad
      WHERE ad.anime_id = at.anime_id AND ad.demographic_id = at.theme_id
    )
  `)

  const counts = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM anime_genre) AS generos,
      (SELECT count(*) FROM anime_theme) AS temas,
      (SELECT count(*) FROM anime_demographic) AS demograficas,
      (SELECT count(DISTINCT anime_id) FROM anime_genre) AS animes_con_genero,
      (SELECT count(DISTINCT anime_id) FROM anime_theme) AS animes_con_tema,
      (SELECT count(DISTINCT anime_id) FROM anime_demographic) AS animes_con_demografica
  `)

  console.log(
    `✓ borrados ${genres.rowCount ?? 0} junctions de género mal clasificados ` +
      `y ${themes.rowCount ?? 0} de tema`
  )
  console.log(
    '  ' +
      JSON.stringify(
        (counts.rows[0] as unknown as Record<string, number>) ?? {}
      )
  )
  process.exit(0)
}

await main()
