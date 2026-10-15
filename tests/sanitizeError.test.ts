import { describe, expect, test } from 'bun:test'
import { sanitizeError } from '../src/utils/sanitizeError.js'

describe('sanitizeError', () => {
  test('enmascara credenciales embebidas en el DSN', () => {
    const masked = sanitizeError(
      'connect failed: postgres://anidev:sup3rsecret@localhost:5432/anidev'
    )
    expect(masked).not.toContain('sup3rsecret')
    expect(masked).toContain('postgres://anidev:***@localhost:5432/anidev')
  })

  test('enmascara tokens en el query string (Turso/authToken)', () => {
    const masked = sanitizeError(
      'libsql error for libsql://db-org.turso.io?authToken=eyJhbGciOi.abc'
    )
    expect(masked).not.toContain('eyJhbGciOi.abc')
    expect(masked).toContain('authToken=***')
    expect(
      sanitizeError('LibsqlError: HTTP status 401 for https://user:pw@db.io')
    ).not.toContain('pw@')
  })

  test('enmascara Bearer y otros params sensibles', () => {
    expect(
      sanitizeError(
        '401 from api: {"error":"invalid token","h":"Bearer eyJ.o.k"}'
      )
    ).not.toContain('eyJ.o.k')
    expect(
      sanitizeError('failed https://api.tvdb.com/v4?apikey=SECRET123&x=1')
    ).toContain('apikey=***')
    expect(sanitizeError('https://x.io?accessToken=abc&b=2')).not.toContain(
      'abc'
    )
    expect(sanitizeError('https://x.io?refresh_token=zzz')).not.toContain('zzz')
  })

  test('acota la longitud a 500 caracteres', () => {
    expect(sanitizeError('x'.repeat(900)).length).toBe(500)
  })

  test('cae al mensaje por defecto cuando no hay texto utilizable', () => {
    expect(sanitizeError(undefined)).toBe('Unknown error')
    expect(sanitizeError('')).toBe('Unknown error')
    expect(sanitizeError(42)).toBe('Unknown error')
  })
})
