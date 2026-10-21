/**
 * Construye el mapa `id MAL → genre | theme | demographic`.
 *
 * La API v2 de MAL **colapsa** todo en `genres` (no expone los campos
 * `themes`/`demographics`: verificado, llegan ausentes), así que la única fuente
 * autoritativa es la barra lateral de la ficha HTML, que sí separa
 * `Genres:` / `Theme:` / `Demographic:`.
 *
 * Recorre las fichas de los animes con más miembros (que concentran los tags
 * habituales) y acumula el mapa. Los ids no vistos quedan como `genre` por
 * defecto, que es el comportamiento seguro.
 *
 *   bun src/scripts/buildMalTaxonomyMap.ts [paginas]
 */
import { db } from '../libs/db.js'
import { anime } from '../schemas/anime.js'
import { desc, isNotNull } from 'drizzle-orm'
import { CONFIG } from '../config/config.js'

const PAGES = Number(process.argv[2] ?? 80)

const KIND = {
  Genres: 'genre',
  Genre: 'genre',
  Theme: 'theme',
  Themes: 'theme',
  Demographic: 'demographic',
  Demographics: 'demographic',
} as const

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const map = new Map<number, string>()

const parseKinds = (html: string) => {
  // Cada bloque: <span class="dark_text">KIND:</span> ... <a href="/anime/genre/ID/...">
  const sections = html.split('<span class="dark_text">')
  for (const section of sections) {
    const labelMatch = section.match(/^([A-Za-z]+):/)
    if (!labelMatch) continue
    const kind = KIND[labelMatch[1] as keyof typeof KIND]
    if (!kind) continue
    const body = section.slice(0, 1200)
    for (const m of body.matchAll(/\/anime\/genre\/(\d+)\//g)) {
      const id = Number(m[1])
      if (!Number.isInteger(id)) continue
      const previous = map.get(id)
      // `genre` es el default: solo se sobreescribe con una etiqueta explícita.
      if (!previous || previous === 'genre') map.set(id, kind)
    }
  }
}

const animes = await db
  .select({ malId: anime.malId })
  .from(anime)
  .where(isNotNull(anime.members))
  .orderBy(desc(anime.members))
  .limit(PAGES)

let ok = 0
for (const [index, row] of animes.entries()) {
  try {
    const response = await fetch(`${CONFIG.MAL_WEB_BASE}/anime/${row.malId}`, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) continue
    parseKinds(await response.text())
    ok++
  } catch {
    // Un fallo puntual no invalida el mapa acumulado.
  }
  if ((index + 1) % 20 === 0) {
    console.log(
      `  ${index + 1}/${animes.length} fichas · ${map.size} ids clasificados`
    )
  }
}

console.log(`\n✓ ${ok} fichas leídas · ${map.size} ids clasificados`)
const byKind: {
  genre: number[]
  theme: number[]
  demographic: number[]
} = { genre: [], theme: [], demographic: [] }
for (const [id, kind] of [...map.entries()].sort((a, b) => a[0] - b[0])) {
  byKind[kind as 'genre' | 'theme' | 'demographic'].push(id)
}
console.log('  genre:', byKind.genre.join(','))
console.log('  theme:', byKind.theme.join(','))
console.log('  demographic:', byKind.demographic.join(','))
console.log(JSON.stringify(Object.fromEntries([...map.entries()])))
process.exit(0)
