/**
 * Vocabulario canónico de `media_type`: el enum `MediaType` de anidev
 * (`poster`, `banner`, `background`, `clearart`, `clearlogo`, `icon`).
 *
 * Las fuentes traen sus propios nombres ('Banner' de TVDB, 'Banner' de AniList,
 * 'picture' del extractor de MAL), así que **se normaliza al escribir**: si la
 * app consulta `media_type = 'banner'` y guardamos `'Banner'`, el asset es
 * invisible para la app.
 */
export const CANONICAL_MEDIA_TYPES = [
  'poster',
  'banner',
  'background',
  'clearart',
  'clearlogo',
  'icon',
] as const

export type CanonicalMediaType = (typeof CANONICAL_MEDIA_TYPES)[number]

/** Alias por nombre de fuente (en minúsculas) → valor canónico. */
const ALIASES: Record<string, CanonicalMediaType> = {
  poster: 'poster',
  banner: 'banner',
  background: 'background',
  backdrop: 'background',
  fanart: 'background',
  clearart: 'clearart',
  clearlogo: 'clearlogo',
  'clear logo': 'clearlogo',
  icon: 'icon',
}

/**
 * Devuelve el valor canónico del `media_type` o `null` si la fuente usa una
 * categoría que el catálogo no modela (p. ej. 'Poster (Season)'): mejor no
 * guardarla que escribir un tipo que la app no entiende.
 */
export const normalizeMediaType = (raw: string): CanonicalMediaType | null => {
  const name = raw.trim().toLowerCase()
  // Una variante con paréntesis (temporada, idioma…) no está en el vocabulario.
  if (name.includes('(')) return null
  return ALIASES[name] ?? null
}
