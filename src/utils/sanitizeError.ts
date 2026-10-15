const MAX_LENGTH = 500

// No cruza `/` para no comerse dos URLs contiguas hasta el último `@`.
const CREDENTIALS_IN_URL = /(\/\/[^:@/\s]+):[^@/\s]+@/g
const SECRET_QUERY_PARAMS =
  /([?&](?:auth_?token|token|api_?key|access_?token|id_?token|refresh_?token|client_?secret|password|secret|signature|sig)=)[^&\s]+/gi
const BEARER_TOKEN = /\b(bearer\s+)[\w.~+/-]+/gi

/**
 * Normaliza un mensaje de error antes de persistirlo en la base de datos.
 *
 * Los errores de libSQL/Drizzle embeben el DSN completo — credenciales en la
 * URL o `authToken` en el query string, como en Turso — y las fuentes a veces
 * repiten el token en el body del error, así que se enmascaran credenciales,
 * params sensibles y `Bearer`, y se acota la longitud para que `tasks.error`
 * no guarde secretos.
 */
export const sanitizeError = (message?: unknown): string => {
  const text =
    typeof message === 'string' && message.length > 0
      ? message
      : 'Unknown error'

  return text
    .replace(CREDENTIALS_IN_URL, '$1:***@')
    .replace(SECRET_QUERY_PARAMS, '$1***')
    .replace(BEARER_TOKEN, '$1***')
    .slice(0, MAX_LENGTH)
}
