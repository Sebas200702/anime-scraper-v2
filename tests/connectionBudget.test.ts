import { describe, expect, test } from 'bun:test'
import { ConnectionBudget } from '../src/core/connectionBudget.js'

describe('ConnectionBudget (tope global del trial)', () => {
  test('nunca deja más de `limit` en uso', async () => {
    const budget = new ConnectionBudget(3)
    let peak = 0
    let inUse = 0

    await Promise.all(
      Array.from({ length: 20 }, async () => {
        await budget.acquire()
        inUse++
        peak = Math.max(peak, inUse)
        await new Promise((r) => setTimeout(r, 5))
        inUse--
        budget.release()
      })
    )

    expect(peak).toBe(3)
    expect(budget.inUse).toBe(0)
  })

  test('libera el cupo a los que esperan, en orden FIFO', async () => {
    const budget = new ConnectionBudget(1)
    const order: number[] = []

    await budget.acquire()
    const pending = [1, 2, 3].map((n) =>
      budget.acquire().then(() => {
        order.push(n)
        budget.release()
      })
    )
    budget.release()
    await Promise.all(pending)

    expect(order).toEqual([1, 2, 3])
  })

  test('rechaza límites inválidos', () => {
    expect(() => new ConnectionBudget(0)).toThrow()
    expect(() => new ConnectionBudget(-1)).toThrow()
  })

  test('release sin acquire no rompe el contador', () => {
    const budget = new ConnectionBudget(2)
    budget.release()
    expect(budget.inUse).toBe(0)
  })
})
