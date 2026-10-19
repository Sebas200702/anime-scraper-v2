import { db } from '../libs/db.js'
import { artist } from '../schemas/artist.js'
import { sql } from 'drizzle-orm'
import { chunk, MAX_PARAMS_PER_STATEMENT } from '../utils/chunk.js'
import { normalizeText } from '../utils/normalize.js'
import { batchUpsert } from './batchUpsert.js'
import type { NewArtist } from '../types/index.js'

/**
 * Resolves artist names to their database IDs.
 * Creates missing artists and returns a Map<normalizedName, id>.
 *
 * This eliminates the duplicated artist resolution logic that appeared
 * in both `saveAnimeThemes` and `saveArtist` in the old animeThemes repository.
 */
export async function resolveArtistIds(
  artistNames: string[]
): Promise<Map<string, number>> {
  if (artistNames.length === 0) return new Map()

  const uniqueNames = [...new Set(artistNames.filter(Boolean))]
  const artistMap = new Map<string, number>()

  // 1. Find existing artists (por nombre normalizado: MAL, ANN y AnimeThemes
  // escriben el mismo artista con distinta capitalización —"Nobodyknows+" y
  // "nobodyknows+"— y el índice único es sobre el nombre exacto).
  for (const batch of chunk(uniqueNames, MAX_PARAMS_PER_STATEMENT)) {
    const normalized = batch.map((name) => normalizeText(name))
    const found = await db
      .select({ id: artist.id, name: artist.name })
      .from(artist)
      .where(
        sql`lower(trim(${artist.name})) = ANY(${sql.raw(
          `ARRAY[${normalized
            .map((n) => `'${n.replace(/'/g, "''")}'`)
            .join(',')}]`
        )})`
      )
    for (const a of found) {
      const key = normalizeText(a.name)
      // Si hay varias filas con el mismo nombre normalizado, gana la más
      // antigua: es la que ya pueden estar referenciando los créditos.
      if (!artistMap.has(key)) artistMap.set(key, a.id)
    }
  }

  // 2. Create missing artists
  const missing: NewArtist[] = uniqueNames
    .filter((name) => !artistMap.has(normalizeText(name)))
    .map((name) => ({ name }))

  if (missing.length > 0) {
    await batchUpsert(artist, missing, 3, 'new-artists')

    // Re-query to get new IDs (por nombre normalizado, igual que antes).
    const newNames = missing.map((a) => a.name)
    for (const batch of chunk(newNames, MAX_PARAMS_PER_STATEMENT)) {
      const normalized = batch.map((name) => normalizeText(name))
      const found = await db
        .select({ id: artist.id, name: artist.name })
        .from(artist)
        .where(
          sql`lower(trim(${artist.name})) = ANY(${sql.raw(
            `ARRAY[${normalized
              .map((n) => `'${n.replace(/'/g, "''")}'`)
              .join(',')}]`
          )})`
        )
      for (const a of found) {
        const key = normalizeText(a.name)
        if (!artistMap.has(key)) artistMap.set(key, a.id)
      }
    }
  }

  return artistMap
}
