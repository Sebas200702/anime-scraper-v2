import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { INCREMENTAL_GROUPS } from '../src/config/incremental.js'
import { STALENESS_VIEWS } from '../src/repositories/tasks/stalenessSql.js'

const dialect = new PgDialect()
const sqlOf = (index: number) =>
  dialect.sqlToQuery(STALENESS_VIEWS[index]!.query).sql.replace(/\s+/g, ' ')

describe('staleness report (S9: vistas de diagnóstico)', () => {
  test('cinco vistas, todas de solo lectura', () => {
    expect(STALENESS_VIEWS).toHaveLength(5)
    for (const [i] of STALENESS_VIEWS.entries()) {
      const text = sqlOf(i).trim()
      expect(text.startsWith('SELECT') || text.startsWith('WITH')).toBe(true)
      expect(text).not.toMatch(/\b(UPDATE|INSERT|DELETE|ALTER|DROP|TRUNCATE)\b/i)
    }
  })

  test('A: estado inconsistente con las fechas', () => {
    expect(sqlOf(0)).toContain("aired_to < now() - interval '7 days'")
    expect(sqlOf(0)).toContain('aired_from <= now()')
  })

  test('B: cola de ficha MAL + episodios con refresh nulo, prioridad y motivo', () => {
    const b = sqlOf(1)
    for (const type of [
      'anime_mal_details_hydration',
      'anime_episodes_hydration',
      'tvdb_episodes_hydration',
    ])
      expect(b).toContain(`'${type}'`)
    for (const column of ['refresh_after IS NULL', 'priority', 'skip_reason', 'last_error'])
      expect(b).toContain(column)
  })

  test('C: salud por fuente hot con pendiente más viejo y último éxito', () => {
    const c = dialect.sqlToQuery(STALENESS_VIEWS[2]!.query)
    expect(c.sql).toContain("min(scheduled_at) FILTER (WHERE status = 'pending')")
    expect(c.sql).toContain('max(last_scraped_at)')
    expect(c.params).toEqual(expect.arrayContaining(INCREMENTAL_GROUPS.hot))
  })

  test('D: corridas recientes por modo y grupo', () => {
    expect(sqlOf(3)).toContain('FROM ingest.run')
    expect(sqlOf(3)).toContain('GROUP BY 1, 2')
  })
})
