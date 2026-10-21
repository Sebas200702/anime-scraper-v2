import { describe, expect, test } from 'bun:test'
import {
  parseProxyEntries,
  parseProxyList,
} from '../src/libs/proxyCandidates.js'

describe('parseProxyList', () => {
  test('extrae ip:port ignorando comentarios y líneas vacías', () => {
    const list = parseProxyList(
      ['# lista', '', '1.2.3.4:8080', '  ', '5.6.7.8:3129'].join('\n')
    )
    expect(list).toEqual(['1.2.3.4:8080', '5.6.7.8:3129'])
  })

  test('acepta esquema y credenciales, y corta metadatos extra', () => {
    const list = parseProxyList(
      [
        'http://1.2.3.4:8080',
        'socks5://1.2.3.4:1080',
        'user:pass@1.2.3.4:8080',
        '1.2.3.4:8080,US,elite,http',
        '1.2.3.4:8080 US 91.2',
      ].join('\n')
    )
    expect(list).toContain('1.2.3.4:8080')
    expect(list).toContain('1.2.3.4:1080')
    expect(list).toContain('user:pass@1.2.3.4:8080')
  })

  test('deduplica y descarta puertos inválidos', () => {
    const list = parseProxyList(
      [
        '1.2.3.4:8080',
        '1.2.3.4:8080',
        '1.2.3.4:0',
        '1.2.3.4:99999',
        'no-port',
      ].join('\n')
    )
    expect(list).toEqual(['1.2.3.4:8080'])
  })

  test('ignora encabezados y JSON suelto', () => {
    const list = parseProxyList(
      ['IP:PORT', '======', '{"protocol":"http"}', '1.2.3.4:8080'].join('\n')
    )
    expect(list).toEqual(['1.2.3.4:8080'])
  })

  test('tolera finales de línea CRLF (exportaciones de proveedores)', () => {
    expect(parseProxyList('1.2.3.4:8080\r\n5.6.7.8:3129\r\n')).toEqual([
      '1.2.3.4:8080',
      '5.6.7.8:3129',
    ])
    expect(parseProxyList('user:pass@1.2.3.4:8080\r\n')).toEqual([
      'user:pass@1.2.3.4:8080',
    ])
  })
})

describe('parseProxyEntries', () => {
  test('lee el formato de proxies.json (array de strings)', () => {
    expect(parseProxyEntries('["1.2.3.4:8080", "5.6.7.8:3129"]')).toEqual([
      '1.2.3.4:8080',
      '5.6.7.8:3129',
    ])
  })

  test('cae a texto plano cuando no es JSON', () => {
    expect(parseProxyEntries('1.2.3.4:8080\n# x\n5.6.7.8:3129')).toEqual([
      '1.2.3.4:8080',
      '5.6.7.8:3129',
    ])
  })

  test('ignora elementos no-string del array', () => {
    expect(parseProxyEntries('[1, null, "1.2.3.4:8080"]')).toEqual([
      '1.2.3.4:8080',
    ])
  })
})
