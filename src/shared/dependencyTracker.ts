/**
 * Señal por lote de "esta escritura dejó filas fuera por dependencias que aún no
 * existen" (el caso típico: una relación cuyo padre no está en la DB todavía).
 *
 * Los filtros de FK la incrementan y el manager la consume al cerrar el lote:
 * si hay filas diferidas, las tareas del lote se marcan `skipped` en vez de
 * `completed`, así se re-ejecutan cuando el padre exista. Es estado por proceso
 * y por lote (se consume y se reinicia), no una cola de datos.
 */
let deferred = 0

export const noteDeferredDependency = (count = 1): void => {
  if (count > 0) deferred += count
}

export const takeDeferredDependencies = (): number => {
  const total = deferred
  deferred = 0
  return total
}
