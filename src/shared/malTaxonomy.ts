/**
 * Mapa `id de MAL → genre | theme | demographic`.
 *
 * La API v2 de MAL **colapsa** los tres en `genres` (los campos `themes` y
 * `demographics` llegan ausentes: verificado). La clasificación autoritativa
 * está en la barra lateral de la ficha (`Genres:` / `Theme:` / `Demographic:`),
 * y este mapa se construyó leyéndola con `bun run taxonomy:build` (220 fichas
 * de los animes con más miembros).
 *
 * Los ids **no presentes** se tratan como `genre` (comportamiento seguro).
 * Reconstruirlo: `bun src/scripts/buildMalTaxonomyMap.ts <n>`.
 */
export const MAL_TAXONOMY_KIND: Record<
  number,
  'genre' | 'theme' | 'demographic'
> = {
  // Demográficas
  25: 'demographic',
  27: 'demographic',
  42: 'demographic',
  43: 'demographic',
  // Temas
  6: 'theme',
  11: 'theme',
  13: 'theme',
  17: 'theme',
  18: 'theme',
  19: 'theme',
  20: 'theme',
  21: 'theme',
  23: 'theme',
  29: 'theme',
  31: 'theme',
  32: 'theme',
  35: 'theme',
  38: 'theme',
  39: 'theme',
  40: 'theme',
  48: 'theme',
  50: 'theme',
  51: 'theme',
  52: 'theme',
  53: 'theme',
  55: 'theme',
  57: 'theme',
  58: 'theme',
  59: 'theme',
  62: 'theme',
  64: 'theme',
  66: 'theme',
  68: 'theme',
  69: 'theme',
  70: 'theme',
  72: 'theme',
  73: 'theme',
  75: 'theme',
  76: 'theme',
  77: 'theme',
  78: 'theme',
  79: 'theme',
  80: 'theme',
  81: 'theme',
  82: 'theme',
  // Géneros (explícitos)
  1: 'genre',
  2: 'genre',
  4: 'genre',
  5: 'genre',
  7: 'genre',
  8: 'genre',
  9: 'genre',
  10: 'genre',
  14: 'genre',
  22: 'genre',
  24: 'genre',
  30: 'genre',
  36: 'genre',
  37: 'genre',
  41: 'genre',
  46: 'genre',
  47: 'genre',
}

/** Clasificación de un id de MAL (default: género). */
export const malTaxonomyKind = (
  id: number
): 'genre' | 'theme' | 'demographic' => MAL_TAXONOMY_KIND[id] ?? 'genre'

/** Ids de MAL por clasificación. */
export const malTaxonomyIds = (
  kind: 'genre' | 'theme' | 'demographic'
): number[] =>
  Object.entries(MAL_TAXONOMY_KIND)
    .filter(([, value]) => value === kind)
    .map(([id]) => Number(id))
