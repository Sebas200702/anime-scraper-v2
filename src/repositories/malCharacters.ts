import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { character } from '../schemas/character.js'
import { animeCharacter } from '../schemas/animeRelations.js'
import { batchUpsert } from '../shared/batchUpsert.js'
import { chunk } from '../utils/chunk.js'
import { unique } from '../utils/deduplicate.js'
import type { MalCharactersProcessorResult } from '../processors/malCharacters.js'

/**
 * Nombre provisional de un personaje cuyo `people/{id}` todavía no se ha
 * consultado. La ficha de la persona lo sustituye; mientras tanto el
 * catálogo no puede tener la fila con `name` nulo (la columna es NOT NULL).
 */
export const PLACEHOLDER_NAME = (id: number): string => `Personaje ${id}`

/**
 * Guarda el reparto completo por anime.
 *
 * 1) Crea la fila del personaje si no existe (con nombre provisional).
 * 2) Crea el vínculo anime ↔ personaje con su rol.
 */
export const malCharactersRepository = {
  async saveMalCharacters(
    results: MalCharactersProcessorResult[]
  ): Promise<number> {
    const links = unique(
      results.flatMap((r) => r.characters),
      (c) => `${c.animeId}:${c.characterId}:${c.role}`
    )
    if (links.length === 0) return 0

    // 1) Los personajes (con nombre provisional si aún no tenemos ficha).
    const characterIds = unique(links, (c) => `${c.characterId}`).map(
      (c) => c.characterId
    )
    for (const batch of chunk(characterIds, 1_000)) {
      await db.execute(sql`
        INSERT INTO character (mal_id, name)
        SELECT v.id, 'Personaje ' || v.id::text
        FROM (VALUES ${sql.join(
          batch.map((id) => sql`(${id}::int)`),
          sql`, `
        )}) AS v(id)
        ON CONFLICT (mal_id) DO NOTHING
      `)
    }

    // 2) Los vínculos con el anime.
    await batchUpsert(
      animeCharacter,
      links.map((c) => ({
        animeId: c.animeId,
        characterId: c.characterId,
        role: c.role,
      })),
      3,
      'anime-character'
    )

    return links.length
  },
}
