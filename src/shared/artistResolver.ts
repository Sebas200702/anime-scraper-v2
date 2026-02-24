import { db } from '../libs/db.js'
import { artist } from '../schemas/artist.js'
import { inArray } from 'drizzle-orm'
import { chunk, SQLITE_MAX_VARIABLES } from '../utils/chunk.js'
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

  // 1. Find existing artists
  for (const batch of chunk(uniqueNames, SQLITE_MAX_VARIABLES)) {
    const found = await db
      .select({ id: artist.id, name: artist.name })
      .from(artist)
      .where(inArray(artist.name, batch))
    for (const a of found) {
      artistMap.set(normalizeText(a.name), a.id)
    }
  }

  // 2. Create missing artists
  const missing: NewArtist[] = uniqueNames
    .filter((name) => !artistMap.has(normalizeText(name)))
    .map((name) => ({ name }))

  if (missing.length > 0) {
    await batchUpsert(artist, missing, 3, 'new-artists')

    // Re-query to get new IDs
    const newNames = missing.map((a) => a.name)
    for (const batch of chunk(newNames, SQLITE_MAX_VARIABLES)) {
      const found = await db
        .select({ id: artist.id, name: artist.name })
        .from(artist)
        .where(inArray(artist.name, batch))
      for (const a of found) {
        artistMap.set(normalizeText(a.name), a.id)
      }
    }
  }

  return artistMap
}
