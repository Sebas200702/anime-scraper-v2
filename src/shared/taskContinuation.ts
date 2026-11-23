/**
 * Resultado de un fetch que **avanzó pero no terminó** (S6, L9: barrido de
 * manga por tramos). El servicio ya guardó su trabajo y su cursor; el manager
 * no guarda ni completa: devuelve la tarea a `pending` sin consumir intento,
 * así el próximo claim (en la misma corrida o la siguiente) sigue desde el
 * cursor. No es un error: no cuenta como fallo ni dispara el circuit breaker.
 */
export class TaskContinuation {
  constructor(readonly note: string) {}
}
