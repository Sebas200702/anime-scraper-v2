/**
 * Clave de nombre de personaje para emparejar el reparto de AniList con el
 * que ya existe **dentro del mismo anime/manga** (nunca una búsqueda global).
 *
 * Reglas: minúsculas, macrones/diacríticos → vocal simple, puntuación fuera,
 * vocales largas romanizadas colapsadas (ou/oo→o, uu→u, aa→a, ee→e, ii→i) y
 * tokens ordenados, así "Apellido, Nombre" y "Nombre Apellido" dan la misma
 * clave.
 */

const LONG_VOWELS: Record<string, string> = {
  ou: 'o',
  oo: 'o',
  uu: 'u',
  aa: 'a',
  ee: 'e',
  ii: 'i',
}

export function normalizeCharacterName(
  value: string | null | undefined
): string | null {
  if (!value) return null

  const tokens = value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '') // macrones y diacríticos → letra base
    .toLowerCase()
    .replace(/['’`]/g, '') // apóstrofos unen ("O'Neil" → "oneil")
    .replace(/[^\p{L}\p{N}]+/gu, ' ') // resto de puntuación → separador
    .split(' ')
    .filter(Boolean)
    .map((token) =>
      token.replace(/ou|oo|uu|aa|ee|ii/g, (pair) => LONG_VOWELS[pair] ?? pair)
    )

  if (tokens.length === 0) return null
  return tokens.sort().join(' ')
}

/** Claves del nombre completo y sus alternativos, sin vacíos ni duplicados. */
export function characterNameKeys(
  name: string | null | undefined,
  alternatives: readonly (string | null | undefined)[] = []
): string[] {
  const keys = new Set<string>()
  for (const candidate of [name, ...alternatives]) {
    const key = normalizeCharacterName(candidate)
    if (key) keys.add(key)
  }
  return [...keys]
}
