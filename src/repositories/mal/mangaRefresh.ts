import { db } from '../../libs/db.js'
import type { MalMangaProcessorResult } from '../../processors/malManga.js'
import { chunk } from '../../utils/chunk.js'
import { unique } from '../../utils/deduplicate.js'
import {
  addMissingCoversSql,
  addMissingGenresSql,
  addMissingSynonymsSql,
  refreshKnownMangaSql,
  upsertGenresSql,
} from './mangaRefreshSql.js'

export interface MangaRefreshCounts {
  rows: number
  covers: number
  genres: number
  synonyms: number
}

/**
 * Lote de manga por vuelta. Se corta por manga (no por fila de junction) para
 * que el NOT EXISTS de cada junction vea todas las filas de un mismo manga en
 * la misma sentencia (todas las tallas de portada o ninguna). Con 500 manga
 * los parámetros quedan muy por debajo del límite de Postgres.
 */
const BATCH = 500

const exec = async (
  items: unknown[],
  query: () => Parameters<typeof db.execute>[0]
): Promise<number> =>
  items.length === 0 ? 0 : ((await db.execute(query())).rowCount ?? 0)

/**
 * T10 (S6, L16): aplica la ficha del ranking a manga que YA existían. Todo por
 * conjuntos (cinco sentencias por lote de 500), sin borrar nada e
 * idempotente: una segunda pasada idéntica no cambia ni reescribe filas.
 * Devuelve cuántas filas/junctions cambió cada paso.
 */
export const refreshKnownManga = async (
  sheets: MalMangaProcessorResult[]
): Promise<MangaRefreshCounts> => {
  const counts = { rows: 0, covers: 0, genres: 0, synonyms: 0 }
  // Lotes por id (el plan puede bloquear en orden de heap): un deadlock con
  // `malManga` aborta la página y el reintento la repite idempotente.
  const sorted = [...sheets].sort((a, b) => a.manga.malId - b.manga.malId)
  for (const batch of chunk(sorted, BATCH)) {
    const rows = batch.map((s) => s.manga)
    counts.rows += await exec(rows, () => refreshKnownMangaSql(rows))
    const media = unique(
      batch.flatMap((s) => s.media),
      (m) => `${m.mangaId}:${m.mediaType}:${m.src}`
    )
    counts.covers += await exec(media, () => addMissingCoversSql(media))
    const genres = unique(
      batch.flatMap((s) => s.genres),
      (g) => `${g.mangaId}:${g.genreId}`
    )
    const named = unique(
      genres.filter((g) => g.name),
      (g) => `${g.genreId}`
    )
    await exec(named, () => upsertGenresSql(named))
    counts.genres += await exec(genres, () => addMissingGenresSql(genres))
    const synonyms = unique(
      batch.flatMap((s) =>
        s.synonyms.map((title) => ({ mangaId: s.manga.malId, title }))
      ),
      (s) => `${s.mangaId}:${s.title}`
    )
    counts.synonyms += await exec(synonyms, () =>
      addMissingSynonymsSql(synonyms)
    )
  }
  return counts
}
