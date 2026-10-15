const MAX_LENGTH = 500

/**
 * Normaliza un mensaje de error antes de persistirlo en la base de datos.
 *
 * Los errores de libSQL/Drizzle embeben el DSN completo (con token o password),
 * así que se enmascaran las credenciales de cualquier URL y se acota la
 * longitud para que `tasks.error` no guarde secretos.
 */
export const sanitizeError = (message?: unknown): string => {
  const text =
    typeof message === 'string' && message.length > 0
      ? message
      : 'Unknown error'

  return text
    .replace(/(\/\/[^:@/\s]+):[^@\s]+@/g, '$1:***@')
    .slice(0, MAX_LENGTH)
}
