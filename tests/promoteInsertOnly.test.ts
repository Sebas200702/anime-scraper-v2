import { describe, expect, test } from 'bun:test'
import { PROMOTION_PLAN, toInsertOnlyPlan } from '../src/libs/promotion.js'

describe('promote --insert-only', () => {
  test('todas las tablas pasan a insert-missing, con su clave y filtro', () => {
    const plan = toInsertOnlyPlan(PROMOTION_PLAN)
    expect(plan).toHaveLength(PROMOTION_PLAN.length)
    plan.forEach((entry, i) => {
      const original = PROMOTION_PLAN[i]
      if (!original) throw new Error(`sin entrada original ${i}`)
      expect(entry.strategy).toBe('insert-missing')
      expect({ ...entry, strategy: original.strategy }).toEqual(original)
    })
  })

  test('no modifica el plan original', () => {
    const before = PROMOTION_PLAN.map((entry) => entry.strategy)
    toInsertOnlyPlan(PROMOTION_PLAN)
    expect(PROMOTION_PLAN.map((entry) => entry.strategy)).toEqual(before)
  })
})
