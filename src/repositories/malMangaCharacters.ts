import { db } from '../libs/db.js'
import { chunk } from '../utils/chunk.js'
import { unique } from '../utils/deduplicate.js'
import type { MalMangaCharactersProcessorResult } from '../processors/malMangaCharacters.js'
import {
  characterExternalMalSql,
  malCharacterPortraitSql,
  malCharacterUpsertSql,
  mangaCharacterLinkSql,
} from './mal/characterWrites.js'

/**
 * Guarda el reparto de un manga con la página de personajes de MAL.
 *
 * Orden por FK: personajes (y su id externo de MAL), después el vínculo
 * manga ↔ personaje y los retratos. Todo idempotente y solo-inserción: los
 * vínculos de AniList del mismo manga se conservan.
 */
export const malMangaCharactersRepository = {
  async saveMalMangaCharacters(
    results: MalMangaCharactersProcessorResult[]
  ): Promise<number> {
    const characters = unique(
      results.flatMap((r) => r.characters),
      (c) => `${c.characterId}`
    )
    if (characters.length === 0) return 0

    for (const batch of chunk(characters, 1_000)) {
      await db.execute(malCharacterUpsertSql(batch))
      const external = characterExternalMalSql(batch.map((c) => c.characterId))
      if (external) await db.execute(external)
    }

    const links = unique(
      results.flatMap((r) =>
        r.characters.map((c) => ({
          mangaId: c.mangaId,
          characterId: c.characterId,
          role: c.role,
        }))
      ),
      (c) => `${c.mangaId}:${c.characterId}:${c.role}`
    )
    for (const batch of chunk(links, 1_000)) {
      const query = mangaCharacterLinkSql(batch)
      if (query) await db.execute(query)
    }

    const portraits = unique(
      characters.flatMap((c) =>
        c.image ? [{ id: c.characterId, src: c.image }] : []
      ),
      (c) => `${c.id}:${c.src}`
    )
    for (const batch of chunk(portraits, 500)) {
      const query = malCharacterPortraitSql(batch)
      if (query) await db.execute(query)
    }

    return links.length
  },
}
