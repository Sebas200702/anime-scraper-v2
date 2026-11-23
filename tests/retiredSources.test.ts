import { describe, expect, test } from 'bun:test'
import { isRetiredSource, RETIRED_SOURCES } from '../src/config/incremental.js'
import {
  DERIVED_SOURCES,
  LISTING_SOURCES,
} from '../src/scripts/initializers.js'
import { requeueTransientSql } from '../src/repositories/tasks/requeueSql.js'
import { PgDialect } from 'drizzle-orm/pg-core'

describe('fuentes retiradas (Jikan caído)', () => {
  test('jikan y jikanRelations están retiradas', () => {
    expect(RETIRED_SOURCES).toContain('jikan')
    expect(RETIRED_SOURCES).toContain('jikanRelations')
    expect(isRetiredSource('jikan')).toBe(true)
    expect(isRetiredSource('mal')).toBe(false)
  })

  test('el discover no lista ni siembra fuentes retiradas', () => {
    expect(LISTING_SOURCES).not.toContain('jikan')
    for (const source of RETIRED_SOURCES) {
      expect(DERIVED_SOURCES).not.toContain(source)
    }
    expect(DERIVED_SOURCES).toContain('malMangaCharacters')
  })

  test('no revive dead_letter de fuentes retiradas', () => {
    const { sql, params } = new PgDialect().sqlToQuery(
      requeueTransientSql(5000)
    )
    expect(sql).toContain('source NOT IN ($1, $2)')
    expect(params.slice(0, 2)).toEqual([...RETIRED_SOURCES])
    expect(params.at(-1)).toBe(5000)
    expect(sql).toMatch(/last_error ~\* /)
  })
})
