/**
 * Safely parse a number from a string, returning null for invalid inputs.
 * Used across multiple processors for extracting numeric values.
 */
export const parseNumber = (text: string | null | undefined): number | null => {
  if (!text) return null
  const cleaned = String(text).replaceAll(',', '')
  const num = Number.parseFloat(cleaned)
  return Number.isNaN(num) ? null : num
}

/**
 * Extract a 4-digit year from a date string.
 * Used by MAL processor for the 'Aired' field.
 */
export const parseYear = (text: string | null | undefined): number | null => {
  if (!text) return null
  const match = /(\d{4})/.exec(text)
  if (!match) return null
  const year = Number.parseInt(match[0], 10)
  return Number.isNaN(year) ? null : year
}

/**
 * Capitalize the first letter of a string.
 * Moved from config/sources.ts to shared for broader reuse.
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
