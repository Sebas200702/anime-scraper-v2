import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  characterExternalMalSql,
  malCharacterUpsertSql,
  malPersonCharacterUpsertSql,
} from '../src/repositories/mal/characterWrites.js'

const dialect = new PgDialect()
const flat = (s: string) => s.replace(/\s+/g, ' ').trim()

const KANJI_MERGE =
  'name_kanji = CASE WHEN EXCLUDED.name_kanji IS NOT NULL THEN EXCLUDED.name_kanji ' +
  'WHEN octet_length(character.name_kanji) > char_length(character.name_kanji) ' +
  'THEN character.name_kanji ELSE NULL END'

describe('malCharacterUpsertSql (S4: name_kanji solo nativo)', () => {
  test('el romaji ASCII va como null y el nativo se conserva', () => {
    const q = dialect.sqlToQuery(
      malCharacterUpsertSql([
        { characterId: 3, name: 'Black, Jet', nativeName: 'Black, Jet' },
        { characterId: 4, name: 'Spiegel, Spike', nativeName: ' スパイク ' },
      ])
    )
    expect(q.params).toEqual([3, 'Black, Jet', null, 4, 'Spiegel, Spike', 'スパイク'])
    expect(flat(q.sql)).toContain(KANJI_MERGE)
    expect(flat(q.sql)).toContain(
      `name = COALESCE(NULLIF(EXCLUDED.name, ''), character.name)`
    )
  })
})

describe('malPersonCharacterUpsertSql (S4)', () => {
  test('nombre nativo ASCII → null; merge que nunca borra un nativo real', () => {
    const q = dialect.sqlToQuery(
      malPersonCharacterUpsertSql([
        { id: 1, name: 'Jet', nativeName: 'JUN', about: null },
        { id: 2, name: 'Faye', nativeName: 'フェイ', about: 'bio' },
      ])
    )
    expect(q.params).toEqual([1, 'Jet', null, null, 2, 'Faye', 'フェイ', 'bio'])
    expect(flat(q.sql)).toContain(KANJI_MERGE)
    expect(flat(q.sql)).toContain('about = COALESCE(EXCLUDED.about, character.about)')
  })
})

describe('characterExternalMalSql (S8)', () => {
  test('upsert por character_id con mal_id = id del personaje, sin pisar otro mal_id', () => {
    const q = dialect.sqlToQuery(characterExternalMalSql([3, 4, 3]) as never)
    expect(q.params).toEqual([3, 4])
    const text = flat(q.sql)
    expect(text).toContain(
      'INSERT INTO character_external (character_id, mal_id, created_at, updated_at)'
    )
    expect(text).toContain('SELECT v.id, v.id, now(), now()')
    // FK: solo personajes que existen; índice parcial: mal_id libre.
    expect(text).toContain('JOIN character c ON c.mal_id = v.id')
    expect(text).toContain(
      'WHERE NOT EXISTS (SELECT 1 FROM character_external ce WHERE ce.mal_id = v.id AND ce.character_id <> v.id)'
    )
    expect(text).toContain(
      'ON CONFLICT (character_id) DO UPDATE SET mal_id = COALESCE(character_external.mal_id, EXCLUDED.mal_id), updated_at = EXCLUDED.updated_at'
    )
  })

  test('sin ids no hay sentencia', () => {
    expect(characterExternalMalSql([])).toBeNull()
  })
})
