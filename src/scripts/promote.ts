/**
 * Promoción Modo A → prod: diff-upsert por clave de identidad.
 *
 *   PROMOTE_TO_URL=postgres://usuario:pass@host:5432/anidev bun run promote --dry-run
 *   PROMOTE_TO_URL=... bun run promote
 *
 * `PROMOTE_FROM_URL` es el origen (por defecto `DATABASE_URL`, la DB local).
 * `--dry-run` lo ejecuta todo y hace ROLLBACK: validación sin efectos.
 */
import { Pool } from 'pg'
import { CONFIG } from '../config/config.js'
import { PROMOTION_PLAN, promote } from '../libs/promotion.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
/**
 * `--only=manga,music_stream` promueve solo esas tablas. Útil para una DB de
 * destino con esquema parcial (p. ej. recién creadas) sin repetir el catálogo
 * entero.
 */
const only = args
  .find((arg) => arg.startsWith('--only='))
  ?.split('=')[1]
  ?.split(',')
  .map((table) => table.trim())
  .filter(Boolean)
const plan = only?.length
  ? PROMOTION_PLAN.filter((entry) => only.includes(entry.table))
  : PROMOTION_PLAN

const toUrl = process.env.PROMOTE_TO_URL
const fromUrl = process.env.PROMOTE_FROM_URL ?? CONFIG.DATABASE_URL

const mask = (url: string) => url.replace(/(:\/\/[^:/]+:)[^@]+@/, '$1***@')

if (!toUrl) {
  console.error(
    'Falta PROMOTE_TO_URL (destino). Ejemplo:\n  PROMOTE_TO_URL=postgres://user:pass@host:5432/anidev bun run promote --dry-run'
  )
  process.exit(1)
}

if (toUrl === fromUrl) {
  console.error('Origen y destino son la misma DB: abortado.')
  process.exit(1)
}

const source = new Pool({ connectionString: fromUrl, max: 4 })
const target = new Pool({ connectionString: toUrl, max: 4 })

console.log(
  `${dryRun ? '🧪 DRY-RUN' : '🚀 PROMOCIÓN'}: ${mask(fromUrl)} → ${mask(toUrl)}\n`
)

try {
  const report = await promote({
    source,
    target,
    dryRun,
    plan,
    log: (message) => console.log(message),
  })

  const totals = report.tables.reduce(
    (acc, table) => ({
      read: acc.read + table.read,
      inserted: acc.inserted + table.inserted,
      updated: acc.updated + table.updated,
      unchanged: acc.unchanged + table.unchanged,
      skipped: acc.skipped + table.skipped,
    }),
    { read: 0, inserted: 0, updated: 0, unchanged: 0, skipped: 0 }
  )

  console.log(
    `\nTotal: ${totals.read} filas leídas · +${totals.inserted} insertadas · ~${totals.updated} actualizadas · =${totals.unchanged} idénticas${
      totals.skipped > 0
        ? ` · ${totals.skipped} omitidas (padre sin destino)`
        : ''
    }`
  )

  if (dryRun) {
    console.log('DRY-RUN: nada se escribió (ROLLBACK).')
  }
} catch (error) {
  console.error('\n❌ Promoción abortada (ROLLBACK):', (error as Error).message)
  process.exit(1)
} finally {
  await source.end()
  await target.end()
}
