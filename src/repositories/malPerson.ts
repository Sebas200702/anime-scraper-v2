import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { character, characterNickname } from '../schemas/character.js'
import { staff, staffAlternativeName } from '../schemas/staff.js'
import { characterMedia, staffMedia } from '../schemas/media.js'
import { batchUpsert } from '../shared/batchUpsert.js'
import { chunk } from '../utils/chunk.js'
import { unique } from '../utils/deduplicate.js'
import type { MalPersonProcessorResult } from '../processors/malPerson.js'

/**
 * Guarda la ficha de las personas de MAL (staff y personajes).
 *
 * La ficha de la API v2 es la fuente de verdad del **nombre** (el HTML de la
 * ficha de anime solo mostraba los primeros 10 personajes) y del **retrato**:
 * la API devuelve la miniatura y aquí se guarda la versión grande (la misma
 * ruta sin la "t" del thumbnail).
 */
export const malPersonRepository = {
  async saveMalPerson(results: MalPersonProcessorResult[]): Promise<number> {
    const staffRows = results.filter((r) => r.kind === 'staff')
    const characterRows = results.filter((r) => r.kind === 'character')

    // 1) Staff.
    if (staffRows.length > 0) {
      for (const batch of chunk(staffRows, 500)) {
        await db.execute(sql`
          INSERT INTO staff (mal_id, name, given_name, family_name, birthday, about)
          SELECT v.id, v.name, v.given_name, v.family_name, v.birthday, v.about
          FROM (VALUES ${sql.join(
            batch.map(
              (r) =>
                sql`(${r.id}::int, ${r.name}::text, ${r.givenName}::text, ${r.familyName}::text, ${r.birthday}::text, ${r.about}::text)`
            ),
            sql`, `
          )}) AS v(id, name, given_name, family_name, birthday, about)
          ON CONFLICT (mal_id) DO UPDATE SET
            name = COALESCE(NULLIF(EXCLUDED.name, ''), staff.name),
            given_name = COALESCE(EXCLUDED.given_name, staff.given_name),
            family_name = COALESCE(EXCLUDED.family_name, staff.family_name),
            birthday = COALESCE(EXCLUDED.birthday, staff.birthday),
            about = COALESCE(EXCLUDED.about, staff.about)
        `)
      }

      const aliases = unique(
        staffRows.flatMap((r) =>
          r.alternativeNames.map((name) => ({ staffId: r.id, name }))
        ),
        (a) => `${a.staffId}:${a.name}`
      )
      for (const batch of chunk(aliases, 1_000)) {
        await db.execute(sql`
          INSERT INTO staff_alternative_name (staff_id, name)
          SELECT v.staff_id, v.name
          FROM (VALUES ${sql.join(
            batch.map((a) => sql`(${a.staffId}::int, ${a.name}::text)`),
            sql`, `
          )}) AS v(staff_id, name)
          ON CONFLICT DO NOTHING
        `)
      }

      const portraits = staffRows.filter((r) => r.imageUrl)
      for (const batch of chunk(portraits, 500)) {
        await db.execute(sql`
          INSERT INTO staff_media (staff_id, media_type, src, size, source, priority)
          SELECT v.id, 'poster', v.image_url, NULL, 'mal', 20
          FROM (VALUES ${sql.join(
            batch.map((r) => sql`(${r.id}::int, ${r.imageUrl}::text)`),
            sql`, `
          )}) AS v(id, image_url)
          ON CONFLICT (staff_id, media_type, src) DO NOTHING
        `)
      }
    }

    // 2) Personajes (el id de MAL de un personaje es un id de persona).
    if (characterRows.length > 0) {
      for (const batch of chunk(characterRows, 500)) {
        await db.execute(sql`
          INSERT INTO character (mal_id, name, name_kanji, about)
          SELECT v.id,
                 CASE WHEN v.name = 'Personaje ' || v.id::text
                      THEN v.name ELSE v.name END,
                 v.native_name, v.about
          FROM (VALUES ${sql.join(
            batch.map(
              (r) =>
                sql`(${r.id}::int, ${r.name}::text, ${r.nativeName}::text, ${r.about}::text)`
            ),
            sql`, `
          )}) AS v(id, name, native_name, about)
          ON CONFLICT (mal_id) DO UPDATE SET
            name = CASE
              WHEN character.name = 'Personaje ' || EXCLUDED.mal_id::text
                THEN EXCLUDED.name
              ELSE character.name
            END,
            name_kanji = COALESCE(EXCLUDED.name_kanji, character.name_kanji),
            about = COALESCE(EXCLUDED.about, character.about)
        `)
      }

      const nicknames = unique(
        characterRows.flatMap((r) =>
          r.alternativeNames.map((nickname) => ({
            characterId: r.id,
            nickname,
          }))
        ),
        (n) => `${n.characterId}:${n.nickname}`
      )
      for (const batch of chunk(nicknames, 1_000)) {
        await db.execute(sql`
          INSERT INTO character_nickname (character_id, nickname)
          SELECT v.character_id, v.nickname
          FROM (VALUES ${sql.join(
            batch.map((n) => sql`(${n.characterId}::int, ${n.nickname}::text)`),
            sql`, `
          )}) AS v(character_id, nickname)
          ON CONFLICT DO NOTHING
        `)
      }

      const portraits = characterRows.filter((r) => r.imageUrl)
      for (const batch of chunk(portraits, 500)) {
        await db.execute(sql`
          INSERT INTO character_media (character_id, media_type, src, size, source, priority)
          SELECT v.id, 'poster', v.image_url, NULL, 'mal', 20
          FROM (VALUES ${sql.join(
            batch.map((r) => sql`(${r.id}::int, ${r.imageUrl}::text)`),
            sql`, `
          )}) AS v(id, image_url)
          ON CONFLICT (character_id, media_type, src) DO NOTHING
        `)
      }
    }

    return results.length
  },
}
