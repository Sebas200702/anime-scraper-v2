/**
 * Siembra `ingest.task_policy` con la política de `REFRESH_POLICY`.
 *
 *   bun run db:seed-policy            # inserta solo lo que falta (respeta ediciones)
 *   bun run db:seed-policy --update   # re-sincroniza todo con el código
 *
 * Idempotente. Sin `--update` **no pisa** la cadencia que se haya editado a
 * mano (la política es dato, no código: el dashboard de control la edita).
 */
import { db } from '../libs/db.js'
import { ingestTaskPolicy } from '../schemas/ingest.js'
import { buildPolicySeedRows } from '../shared/taskPolicy.js'

const update = process.argv.includes('--update')
const rows = buildPolicySeedRows()

for (const row of rows) {
  const insert = db.insert(ingestTaskPolicy).values(row)
  if (update) {
    await insert.onConflictDoUpdate({
      target: [ingestTaskPolicy.source, ingestTaskPolicy.taskType],
      set: {
        refreshIntervalSeconds: row.refreshIntervalSeconds,
        refreshIntervalAiringSeconds: row.refreshIntervalAiringSeconds,
        maxAttempts: row.maxAttempts,
        priority: row.priority,
      },
    })
  } else {
    await insert.onConflictDoNothing()
  }
}

console.log(
  `✓ task_policy sembrada: ${rows.length} tipos (${update ? 'update' : 'sin pisar'} )`
)
for (const row of rows) {
  const cold =
    row.refreshIntervalSeconds === null
      ? 'nunca'
      : `${row.refreshIntervalSeconds}s`
  const hot =
    row.refreshIntervalAiringSeconds === null
      ? '—'
      : `${row.refreshIntervalAiringSeconds}s`
  console.log(`  ${row.source}.${row.taskType}: cold ${cold} · airing ${hot}`)
}
process.exit(0)
