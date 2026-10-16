/**
 * Siembra `ingest.task_policy` con la cadencia de `DEFAULT_REFRESH_SECONDS`.
 *
 *   bun run db:seed-policy
 *
 * Idempotente (upsert por `(source, task_type)`): se puede correr antes de
 * cada backfill sin duplicar nada. Sin estas filas el refresh sigue
 * funcionando por el fallback en código, pero la cadencia no sería editable
 * como dato (dashboard de control de D.0).
 */
import { db } from '../libs/db.js'
import { ingestTaskPolicy } from '../schemas/ingest.js'
import { buildPolicySeedRows } from '../shared/taskPolicy.js'

const rows = buildPolicySeedRows()

for (const row of rows) {
  await db
    .insert(ingestTaskPolicy)
    .values(row)
    .onConflictDoUpdate({
      target: [ingestTaskPolicy.source, ingestTaskPolicy.taskType],
      set: {
        refreshIntervalSeconds: row.refreshIntervalSeconds,
        refreshIntervalAiringSeconds: row.refreshIntervalAiringSeconds,
        maxAttempts: row.maxAttempts,
        priority: row.priority,
      },
    })
}

console.log(`✓ task_policy sembrada: ${rows.length} tipos`)
for (const row of rows) {
  console.log(
    `  ${row.source}.${row.taskType}: cada ${row.refreshIntervalSeconds}s`
  )
}
process.exit(0)
