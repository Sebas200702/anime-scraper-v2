/**
 * Rate gate global por clave (`host|proxy`) con ventana deslizante y cola FIFO.
 *
 * Reemplaza a los limiters por worker de la Fase 0: la cuota es **por IP de
 * salida**, así que la clave incluye el proxy. Un worker con 100 proxies puede
 * ir a la cuota completa de cada IP sin exceder ninguna.
 *
 * Además soporta `pause(key, ms)` para que el orquestador pueda parar una clave
 * concreta cuando la fuente devuelve `Retry-After`.
 */

export interface RateLimits {
  perSecond?: number
  perMinute: number
}

export interface RateGateOptions {
  /** Inyectable para tests deterministas. */
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export interface AcquireResult {
  /** Cuánto se esperó (0 si había cupo). */
  waitedMs: number
  /** Espera que se le pidió al reloj. */
  sleptMs: number
}

const SECOND = 1000
const MINUTE = 60_000

export class RateGate {
  private readonly windows = new Map<string, number[]>()
  private readonly pausedUntil = new Map<string, number>()
  private readonly chains = new Map<string, Promise<unknown>>()
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: RateGateOptions = {}) {
    this.now = options.now ?? Date.now
    this.sleep =
      options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  /**
   * Espera el cupo de `key` (host + proxy) y lo consume. Los llamadores de la
   * misma clave se serializan en orden de llegada.
   */
  acquire(key: string, limits: RateLimits): Promise<AcquireResult> {
    const previous = this.chains.get(key) ?? Promise.resolve()
    const next = previous.then(() => this.takeSlot(key, limits))

    // La cadena no se rompe si un acquire falla.
    this.chains.set(
      key,
      next.catch(() => undefined)
    )

    return next
  }

  /** Pausa global de la clave (p. ej. por `Retry-After` de la fuente). */
  pause(key: string, ms: number): void {
    if (ms <= 0) return
    const until = this.now() + ms
    if (until > (this.pausedUntil.get(key) ?? 0)) {
      this.pausedUntil.set(key, until)
    }
  }

  /** Estado observable (métricas y tests). */
  snapshot(key: string): { inWindow: number; pausedMs: number } {
    const now = this.now()
    const window = (this.windows.get(key) ?? []).filter((t) => now - t < MINUTE)
    return {
      inWindow: window.length,
      pausedMs: Math.max(0, (this.pausedUntil.get(key) ?? 0) - now),
    }
  }

  private async takeSlot(
    key: string,
    limits: RateLimits
  ): Promise<AcquireResult> {
    const start = this.now()
    let wait = Math.max(0, (this.pausedUntil.get(key) ?? 0) - start)

    const window = (this.windows.get(key) ?? []).filter(
      (t) => start - t < MINUTE
    )
    const lastSecond = window.filter((t) => start - t < SECOND)
    const oldestSecond = lastSecond[0]
    const oldestMinute = window[0]

    if (
      limits.perSecond !== undefined &&
      lastSecond.length >= limits.perSecond &&
      oldestSecond !== undefined
    ) {
      wait = Math.max(wait, SECOND - (start - oldestSecond))
    }
    if (window.length >= limits.perMinute && oldestMinute !== undefined) {
      wait = Math.max(wait, MINUTE - (start - oldestMinute))
    }

    let sleptMs = 0
    if (wait > 0) {
      sleptMs = wait
      await this.sleep(wait)
    }

    const stamp = this.now()
    window.push(stamp)
    this.windows.set(
      key,
      window.filter((t) => stamp - t < MINUTE)
    )

    return { waitedMs: stamp - start, sleptMs }
  }
}

/** Clave del gate: la cuota depende del host **y** de la IP de salida. */
export const gateKey = (url: string, proxy?: string): string => {
  let host = url
  try {
    host = new URL(url).host
  } catch {
    // URL rara: se usa tal cual como host best-effort
  }
  return `${host}|${proxy ?? 'direct'}`
}
