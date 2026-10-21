import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { mediaRepository } from './media.js'
import { chunk } from '../utils/chunk.js'
import { normalizeText } from '../utils/normalize.js'
import type { TvdbEpisodesProcessorResult } from '../types/index.js'

interface OurEpisode {
  id: number
  number: number
  title: string
  aired: string
}

interface TvdbEpisode {
  number: number | null
  absoluteNumber: number | null
  aired: string | null
  name: string | null
  image: string
}

const norm = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, '')

/** Una fecha "2026-10-11" → comparable (sin horas). */
const day = (value: string | null | undefined): string =>
  (value ?? '').slice(0, 10)

/**
 * Miniatura de episodio de TVDB.
 *
 * TVDB entrega los episodios en varios criterios de orden ("Aired Order", "DVD
 * Order"…) y **reinicia la numeración** en cada bloque, así que su `number` no
 * es la numeración de MAL. Lo que sí es común es la **fecha de emisión**: se
 * empareja por día y, si un día tiene varios, se elige el más cercano en
 * número. Cuando no hay fecha se recurre al título (TVDB los publica en
 * japonés, así que solo acierta cuando ambas fuentes usan el mismo idioma).
 *
 * Si no se puede emparejar, no se guarda imagen: es preferible dejar la
 * miniatura vacía antes que colgar la imagen de otro episodio.
 */
export const tvdbEpisodesRepository = {
  async saveTvdbEpisodes(
    results: TvdbEpisodesProcessorResult[]
  ): Promise<number> {
    if (results.length === 0) return 0

    const animeIds = results.map((r) => r.animeId)
    const ours = new Map<number, OurEpisode[]>()
    for (const batch of chunk(animeIds, 500)) {
      const rows = await db.execute(sql`
        SELECT id, anime_id, number, title, coalesce(aired, '') AS aired
        FROM episode
        WHERE anime_id IN (${sql.join(
          batch.map((id) => sql`${id}`),
          sql`, `
        )})
        ORDER BY anime_id, number
      `)
      for (const row of rows.rows as unknown as {
        id: number
        anime_id: number
        number: number
        title: string
        aired: string
      }[]) {
        const list = ours.get(row.anime_id) ?? []
        list.push(row)
        ours.set(row.anime_id, list)
      }
    }

    const media: {
      entityType: 'episode'
      entityId: number
      mediaType: string
      src: string
      size: null
    }[] = []

    // Títulos/fechas que completan los episodios con marcador "Episode NN".
    const pendingTitles: {
      id: number
      title: string | null
      aired: string | null
    }[] = []

    for (const result of results) {
      const ourEpisodes = ours.get(result.animeId) ?? []
      if (ourEpisodes.length === 0) continue

      // TVDB por día de emisión.
      const byDay = new Map<string, TvdbEpisode[]>()
      const byTitle = new Map<string, TvdbEpisode>()
      for (const episode of result.episodes) {
        const key = day(episode.aired)
        if (key) byDay.set(key, [...(byDay.get(key) ?? []), episode])
        const titleKey = norm(episode.name)
        if (titleKey.length >= 3 && !byTitle.has(titleKey)) {
          byTitle.set(titleKey, episode)
        }
      }

      for (const oursEpisode of ourEpisodes) {
        const key = day(oursEpisode.aired)
        let match: TvdbEpisode | undefined
        if (key && byDay.has(key)) {
          const candidates = byDay.get(key) as TvdbEpisode[]
          match =
            candidates.length === 1
              ? candidates[0]
              : candidates.reduce((best, c) =>
                  Math.abs((c.number ?? 0) - oursEpisode.number) <
                  Math.abs((best.number ?? 0) - oursEpisode.number)
                    ? c
                    : best
                )
        } else {
          match = byTitle.get(norm(oursEpisode.title))
        }
        if (!match) continue
        if (match.image) {
          media.push({
            entityType: 'episode',
            entityId: oursEpisode.id,
            mediaType: 'thumbnail',
            src: match.image,
            size: null,
          })
        }
        // TVDB además trae el **título real** y la fecha de emisión: nuestros
        // episodios vendían con el marcador "Episode NN" (Kitsu no publica el
        // título de la mayoría), así que se completan aquí.
        const title = match.name?.trim()
        const aired = day(match.aired)
        if (title || aired) {
          pendingTitles.push({
            id: oursEpisode.id,
            title: title || null,
            aired: aired || null,
          })
        }
      }
    }

    // Títulos y fechas: solo se rellenan los que están vacíos o son el
    // marcador "Episode NN" (nunca se pisa un título real).
    for (const batch of chunk(pendingTitles, 500)) {
      await db.execute(sql`
        UPDATE episode e
        -- NULLIF anidados: el marcador "Episode NN" tambien es un null (si no,
        -- COALESCE se queda con el titulo viejo y nunca aplica el nuevo).
        SET title = COALESCE(
              NULLIF(
                NULLIF(e.title, ''),
                'Episode ' || lpad(e.number::text, 2, '0')
              ),
              v.title
            ),
            aired = COALESCE(NULLIF(e.aired, ''), v.aired)
        FROM (VALUES ${sql.join(
          batch.map(
            (t) =>
              sql`(${t.id}::int, ${t.title ?? null}::text, ${t.aired ?? null}::text)`
          ),
          sql`, `
        )}) AS v(id, title, aired)
        WHERE e.id = v.id
      `)
    }

    if (media.length === 0) return 0
    const unique = new Map(media.map((m) => [`${m.entityId}:${m.src}`, m]))
    return await mediaRepository.saveMedia([...unique.values()], 'tvdb')
  },
}
