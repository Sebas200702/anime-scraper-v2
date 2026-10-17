import { eq } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { anime } from '../schemas/anime.js'
import { producer } from '../schemas/producer.js'
import { demographic, genre, theme } from '../schemas/animeTaxonomy.js'
import {
  animeDemographic,
  animeGenre,
  animeProducer,
  animeTheme,
} from '../schemas/animeRelations.js'
import { batchUpsert } from '../shared/batchUpsert.js'
import { unique } from '../utils/deduplicate.js'
import type {
  AnimeMalDetailsProcessorResult,
  ScrapingTask,
} from '../types/index.js'

/**
 * Escribe lo que **solo MAL** tiene bien: stats y descriptivos de `anime` +
 * junctions de taxonomía y compañías con ids MAL nativos.
 *
 * Reglas: los null nunca se escriben (patch disperso, `COALESCE` en el upsert
 * de taxonomía) y las junctions son idempotentes (`onConflictDoNothing`).
 */
const patchFrom = (
  stats: NonNullable<AnimeMalDetailsProcessorResult['animeStats']>
): Record<string, unknown> => {
  const cols: Record<string, unknown> = {}
  const set = <K extends keyof typeof stats>(key: K, column: string) => {
    if (stats[key] !== undefined) cols[column] = stats[key]
  }
  set('titleEnglish', 'titleEnglish')
  set('titleJapanese', 'titleJapanese')
  set('type', 'type')
  set('status', 'status')
  set('episodes', 'episodes')
  set('score', 'score')
  set('scoredBy', 'scoredBy')
  set('popularityRank', 'popularityRank')
  set('rating', 'rating')
  set('year', 'year')
  set('season', 'season')
  set('synopsis', 'synopsis')
  set('background', 'background')
  set('source', 'source')
  set('duration', 'duration')
  set('rank', 'rank')
  set('members', 'members')
  set('broadcastDay', 'broadcastDay')
  set('broadcastTime', 'broadcastTime')
  set('broadcastTimezone', 'broadcastTimezone')
  if (stats.airedFrom !== undefined) cols.airedFrom = new Date(stats.airedFrom)
  if (stats.airedTo !== undefined) cols.airedTo = new Date(stats.airedTo)
  return cols
}

export const malRepository = {
  async saveAnimeMalDetails(
    results: AnimeMalDetailsProcessorResult[],
    _task?: ScrapingTask
  ): Promise<number> {
    const genres = results.flatMap((r) => r.genres)
    const demographics = results.flatMap((r) => r.demographics)
    const themes = results.flatMap((r) => r.themes)
    const producers = results.flatMap((r) => r.producers)
    const animeGenres = results.flatMap((r) => r.animeGenres)
    const animeDemographics = results.flatMap((r) => r.animeDemographics)
    const animeThemes = results.flatMap((r) => r.animeThemes)
    const animeProducers = results.flatMap((r) => r.animeProducers)

    let patched = 0
    for (const result of results) {
      if (!result.animeStats) continue
      const cols = patchFrom(result.animeStats)
      if (Object.keys(cols).length === 0) continue
      await db
        .update(anime)
        .set(cols)
        .where(eq(anime.malId, result.animeStats.malId))
      patched++
    }

    // Taxonomía: upsert de la fila (nombre) y junction idempotente.
    await Promise.all([
      batchUpsert(
        genre,
        unique(genres, (g) => g.malId),
        2,
        'genre'
      ),
      batchUpsert(
        demographic,
        unique(demographics, (d) => d.malId),
        2,
        'demographic'
      ),
      batchUpsert(
        theme,
        unique(themes, (t) => t.malId),
        2,
        'theme'
      ),
      batchUpsert(
        producer,
        unique(producers, (p) => p.malId),
        1,
        'producer'
      ),
    ])

    const uGenres = unique(animeGenres, (g) => `${g.animeId}:${g.genreId}`)
    const uDemo = unique(
      animeDemographics,
      (d) => `${d.animeId}:${d.demographicId}`
    )
    const uThemes = unique(animeThemes, (t) => `${t.animeId}:${t.themeId}`)
    const uProducers = unique(
      animeProducers,
      (p) => `${p.animeId}:${p.producerId}:${p.role}`
    )

    await Promise.all([
      batchUpsert(animeGenre, uGenres, 2, 'anime-genre'),
      batchUpsert(animeDemographic, uDemo, 2, 'anime-demographic'),
      batchUpsert(animeTheme, uThemes, 2, 'anime-theme'),
      // La junction tiene `role` en la PK: el upsert no la colapsa.
      db.insert(animeProducer).values(uProducers).onConflictDoNothing(),
    ])

    return (
      patched +
      uGenres.length +
      uDemo.length +
      uThemes.length +
      uProducers.length
    )
  },

  /**
   * Guarda una tanda de ranking (cientos de anime por request). Reusa el guardado
   * por-anime: parche disperso + junctions idempotentes.
   */
  async saveMalRanking(
    results: { results?: AnimeMalDetailsProcessorResult[] }[]
  ): Promise<number> {
    const flat = results.flatMap((r) => r.results ?? [])
    return await this.saveAnimeMalDetails(flat)
  },
}

// (sin `sql` crudo: todo va por el query builder de drizzle)

