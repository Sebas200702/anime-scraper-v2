export function normalizeText(value: string | null | undefined): string {
  if (!value) return ''

  return value
    .normalize('NFKC') // normaliza unicode (acentos raros, símbolos)
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, ' ') // espacios múltiples → uno solo
}
