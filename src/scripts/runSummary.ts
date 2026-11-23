import type { RunSummary } from '../core/genericManager.js'

export const emptySummary = (): RunSummary => ({
  processed: 0,
  failed: 0,
  retried: 0,
  deadLettered: 0,
  blocked: 0,
  byKind: {},
})

export const addSummary = (total: RunSummary, partial: RunSummary): void => {
  total.processed += partial.processed
  total.failed += partial.failed
  total.retried += partial.retried
  total.deadLettered += partial.deadLettered
  total.blocked += partial.blocked
  for (const [kind, count] of Object.entries(partial.byKind)) {
    total.byKind[kind] = (total.byKind[kind] ?? 0) + count
  }
}
