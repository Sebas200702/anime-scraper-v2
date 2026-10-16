/**
 * Presupuesto global de conexiones concurrentes.
 *
 * El trial de proxies limita las **conexiones simultáneas** (10), no las
 * requests totales. Sin esto, cada fuente correría sus propias 10 en paralelo y
 * el proveedor rotaría/quemaría. Con el presupuesto, todas las fuentes de un
 * backfill comparten un único tope: las cuotas por (host, IP) las sigue
 * aplicando el `RateGate`, pero nunca se abren más conexiones que las contratadas.
 *
 * Es un semáforo: se adquiere justo antes del fetch y se suelta al terminar (el
 * guardado no ocupa conexión).
 */
export class ConnectionBudget {
  private active = 0
  private readonly waiters: (() => void)[] = []

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`ConnectionBudget: límite inválido (${limit})`)
    }
  }

  get inUse(): number {
    return this.active
  }

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++
      return
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.active++
        resolve()
      })
    })
  }

  release(): void {
    if (this.active <= 0) return
    this.active--
    this.waiters.shift()?.()
  }
}
