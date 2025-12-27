/**
 * Elimina duplicados de un array basándose en una función de clave
 * @param {Array} arr - Array de objetos
 * @param {Function} keyFn - Función que extrae la clave única de cada objeto
 * @returns {Array} - Array sin duplicados
 */
export function unique<T>(arr: T[], keyFn: (item: T) => any) {
  if (!arr || arr.length === 0) return []
  return Array.from(new Map(arr.map((item) => [keyFn(item), item])).values())
}

/**
 * Elimina duplicados por mal_id (caso común en Jikan)
 */
export function uniqueByMalId(arr: any[]) {
  return unique(arr, (item) => item.mal_id)
}

/**
 * Elimina duplicados por anime_id (caso común en mapping)
 */
export function uniqueByAnimeId(arr: any[]) {
  return unique(arr, (item) => item.anime_id)
}
