/**
 * Centralized stats tracking and reporting.
 * Extracted from GenericManager to follow single-responsibility principle.
 */
export class StatsReporter {
  private stats = {
    startTime: Date.now(),
    tasksCompleted: 0,
    tasksProcessed: 0,
    tasksErrors: 0,
    itemsSaved: {} as Record<string, number>,
  }

  constructor(private sourceName: string) {}

  reset() {
    this.stats = {
      startTime: Date.now(),
      tasksCompleted: 0,
      tasksProcessed: 0,
      tasksErrors: 0,
      itemsSaved: {},
    }
  }

  incrementProcessed() {
    this.stats.tasksProcessed++
  }

  incrementErrors(count = 1) {
    this.stats.tasksErrors += count
  }

  recordSaved(entity: string, count: number, taskCount: number) {
    this.stats.tasksCompleted += taskCount
    this.stats.itemsSaved[entity] = (this.stats.itemsSaved[entity] ?? 0) + count
  }

  print() {
    const elapsed = Date.now() - this.stats.startTime
    const min = (elapsed / 60000).toFixed(2)
    const tasksPerMin =
      elapsed > 0
        ? (this.stats.tasksCompleted / (elapsed / 60000)).toFixed(1)
        : '0'

    console.log('\n══════════════════════════════')
    console.log(`📊 ${this.sourceName.toUpperCase()} STATS`)
    console.log(`⏱️  ${min} min`)
    console.log(`🔄 Processed: ${this.stats.tasksProcessed}`)
    console.log(`✅ Saved: ${this.stats.tasksCompleted} (${tasksPerMin}/min)`)
    console.log(`❌ Errors: ${this.stats.tasksErrors}`)

    if (Object.keys(this.stats.itemsSaved).length > 0) {
      console.log('💾 Items Saved:')
      for (const [key, value] of Object.entries(this.stats.itemsSaved)) {
        console.log(`   ${key}: ${value}`)
      }
    }

    console.log('══════════════════════════════\n')
  }
}
