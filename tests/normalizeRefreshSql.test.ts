import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { HOT_ANIME_IDS_SQL } from '../src/repositories/tasks/animeSets.js'
import {
  APPLY_HOT_SQL,
  HOT_COUNT_SQL,
  PRIORITIZE_AIRING_SQL,
} from '../src/repositories/tasks/normalizeRefreshSql.js'

const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
const hotSet = flat(new PgDialect().sqlToQuery(HOT_ANIME_IDS_SQL).sql)

describe('normalizeRefresh (S9: mismo hot set que la completitud)', () => {
  test('conteo, cadencia airing y prioridad usan el hot set compartido (14 días)', () => {
    for (const query of [HOT_COUNT_SQL, APPLY_HOT_SQL, PRIORITIZE_AIRING_SQL]) {
      expect(flat(query)).toContain(hotSet)
      expect(flat(query)).toContain("aired_to >= now() - interval '14 days'")
      expect(flat(query)).not.toContain("aired_to >= now() - interval '7 days'")
    }
  })
})
