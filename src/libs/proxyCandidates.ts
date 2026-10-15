/**
 * Extrae entradas de proxy de un listado de texto (los repos que publican
 * listas sueltan `ip:port` por línea, a veces con `protocol://` delante,
 * `user:pass@` delante o metadatos extra después de la coma/espacio).
 */

const HOST_PORT =
  /^(?:(?<user>[^:@\s]+):(?<pass>[^@\s]+)@)?(?<host>[\w.-]+):(?<port>\d{1,5})$/

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

/**
 * Lee una lista de proxies en JSON (array de strings, formato `proxies.json`) o
 * en texto plano (`ip:port` por línea).
 */
export const parseProxyEntries = (raw: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (entry): entry is string => typeof entry === 'string'
      )
    }
  } catch {
    // No es JSON: se trata como listado de texto.
  }

  return parseProxyList(raw)
}

export const parseProxyList = (text: string): string[] => {
  const entries = new Set<string>()

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue

    // El primer token es el proxy; lo demás son columnas de metadatos.
    const token = (line.split(/[\s,|]/)[0] ?? '').replace(SCHEME, '')
    const match = HOST_PORT.exec(token)
    if (!match?.groups) continue

    const port = Number(match.groups.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue

    entries.add(token)
  }

  return [...entries]
}
