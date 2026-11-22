import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { anime } from '../src/schemas/anime.js'
import { fillOnlySet } from '../src/utils/fillOnly.js'

const dialect = new PgDialect()
const render = (set: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(set).map(([key, value]) => [
      key,
      dialect.sqlToQuery(sql`${value}`),
    ])
  )

describe('fillOnlySet (S7: el parche de AniList solo rellena huecos)', () => {
  test('texto: conserva el valor existente no vacío (COALESCE + NULLIF)', () => {
    const out = render(fillOnlySet(anime, { synopsis: 'Nueva', source: 'Manga' }))
    expect(out.synopsis).toMatchObject({
      sql: `COALESCE(NULLIF("anime"."synopsis", ''), $1)`,
      params: ['Nueva'],
    })
    expect(out.source).toMatchObject({
      sql: `COALESCE(NULLIF("anime"."source", ''), $1)`,
      params: ['Manga'],
    })
  })

  test('fecha: COALESCE sin NULLIF y valor codificado por la columna', () => {
    const date = new Date('1998-04-03T00:00:00.000Z')
    const out = render(fillOnlySet(anime, { airedFrom: date }))
    expect(out.airedFrom?.sql).toBe(`COALESCE("anime"."aired_from", $1)`)
    expect(out.airedFrom?.params).toHaveLength(1)
    expect(String(out.airedFrom?.params[0])).toContain('1998-04-03')
  })

  test('solo las columnas presentes; un parche vacío no produce SET', () => {
    expect(Object.keys(fillOnlySet(anime, {}))).toEqual([])
    expect(
      Object.keys(fillOnlySet(anime, { trailerYoutubeId: 'x', broadcastDay: 'Mondays' }))
    ).toEqual(['trailerYoutubeId', 'broadcastDay'])
  })

  test('una clave que no es columna de la tabla es un error', () => {
    expect(() => fillOnlySet(anime, { nope: 1 })).toThrow('nope')
  })
})
