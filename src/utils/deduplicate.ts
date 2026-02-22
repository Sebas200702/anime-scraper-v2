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
