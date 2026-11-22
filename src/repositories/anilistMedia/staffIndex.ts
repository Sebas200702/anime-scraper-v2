import { db } from '../../libs/db.js'
import { normalizeText } from '../../utils/normalize.js'

/**
 * Índice global nombre → id de `staff` para cruzar el staff y las voces de
 * AniList con las personas de MAL. Solo staff: los personajes ya no se cruzan
 * globalmente (se emparejan dentro del reparto del medio, ver `cast.ts`).
 *
 * Se cachea en el módulo: el repositorio vive en el proceso del servicio.
 */
let staffIndex: Map<string, number> | null = null

/**
 * Claves de un nombre: MAL escribe "Urasawa, Naoki" y AniList "Naoki Urasawa",
 * así que también se busca la variante invertida.
 */
export const staffNameKeys = (value: string | null | undefined): string[] => {
  const base = normalizeText(value)
  if (!base) return []
  const keys = [base]
  if (base.includes(',')) {
    const parts = base.split(',').map((s) => s.trim())
    const last = parts[0]
    const first = parts.slice(1).join(',').trim()
    if (last && first) keys.push(`${first} ${last}`)
  }
  return keys
}

export const loadStaffIndex = async (): Promise<Map<string, number>> => {
  if (staffIndex) return staffIndex
  const index = new Map<string, number>()
  for (const row of (await db.execute(`SELECT mal_id, name FROM staff`))
    .rows as unknown as { mal_id: number; name: string }[]) {
    const norm = normalizeText(row.name)
    if (norm && !index.has(norm)) index.set(norm, row.mal_id)
  }
  staffIndex = index
  return staffIndex
}

/** Invalida el índice de staff (tras una tanda grande de `malPerson`). */
export const invalidateStaffIndex = (): void => {
  staffIndex = null
}

/** Id de staff de una voz por nombre (completo o invertido). */
export const findStaffId = (
  index: Map<string, number>,
  name: string
): number | undefined =>
  staffNameKeys(name)
    .map((k) => index.get(k))
    .find((v) => v !== undefined)
