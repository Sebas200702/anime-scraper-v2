/**
 * Una tarea que **no puede ejecutarse todavía** porque le falta una dependencia
 * (un id cruzado, una fila padre que aún no existe) no es un fallo: se marca
 * `skipped` y se re-arma cuando la dependencia llegue.
 *
 * Antes esto era un error genérico: consumía los 3 intentos y terminaba en
 * `dead_letter`, o rompía la escritura por FK y perdía las relaciones.
 */
export class SkippedTaskError extends Error {
  readonly reason: string

  constructor(reason: string) {
    super(`Skipped: ${reason}`)
    this.name = 'SkippedTaskError'
    this.reason = reason
  }
}
