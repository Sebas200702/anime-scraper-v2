import type { ScrapingTask } from '../types/index.js'
import type { ProxyTarget } from '../libs/transport.js'
import { FetchError } from '../libs/fetcher.js'

const extractId = (json: any) => {
  // TVDB
  if (json.data && Array.isArray(json.data) && json.data[0]?.tvdb_id) {
    return json.data[0].tvdb_id
  }

  // Kitsu
  if (json.data && Array.isArray(json.data) && json.data[0]?.id) {
    return json.data[0].id
  }

  return null
}

export const mapWithRetry = async (
  payload: ScrapingTask['payload'],
  mappingFunction: (searchParams: any, agent: any) => Promise<{ json: any }>,
  rateLimiter: (() => Promise<void>) | null,
  agent: ProxyTarget
) => {
  const { title, title_english, title_japanese, year, type, title_synonyms } =
    payload as {
      title: string
      title_english?: string
      title_japanese?: string
      year?: number
      type?: string
      title_synonyms?: string[]
    }

  // Estrategias de búsqueda en orden de prioridad
  // Primero intenta todas con año, luego sin año
  const strategiesWithYear = [
    // Título original + año
    year ? { title, year } : null,
    // Título inglés + año (si existe)
    title_english && year ? { title: title_english, year } : null,
    // Título japonés + año (si existe)
    title_japanese && year ? { title: title_japanese, year } : null,
    // Sinónimos + año (probar primeros 3)
    ...(title_synonyms && Array.isArray(title_synonyms) && year
      ? title_synonyms.slice(0, 3).map((syn) => ({ title: syn, year }))
      : []),
  ].filter(Boolean)

  const strategiesWithoutYear = [
    // Título original (sin año)
    { title },
    // Título inglés (si existe)
    title_english ? { title: title_english } : null,
    // Título japonés (si existe)
    title_japanese ? { title: title_japanese } : null,
    // Sinónimos sin año (probar primeros 3)
    ...(title_synonyms && Array.isArray(title_synonyms)
      ? title_synonyms.slice(0, 3).map((syn) => ({ title: syn }))
      : []),
  ].filter(Boolean)

  // Primero intentar con año, luego sin año
  const strategies = [...strategiesWithYear, ...strategiesWithoutYear]

  for (let attempt = 0; attempt < strategies.length; attempt++) {
    const searchParams = strategies[attempt]

    try {
      // Respetar rate limit
      if (rateLimiter) {
        await rateLimiter()
      }

      const { json } = await mappingFunction(searchParams, agent)
      const id = extractId(json)

      if (id) {
        console.log(
          `✓ Found ID ${id} for "${title}" (strategy ${
            attempt + 1
          }: ${JSON.stringify(searchParams)})`
        )
        return id
      }

      // Mostrar cuántos resultados se obtuvieron pero no coincidieron
      const resultCount =
        json.data?.length || json.data?.Page?.media?.length || 0
      console.log(
        `⚠ No match for "${title}" on attempt ${attempt + 1}/${
          strategies.length
        } (${resultCount} results, but no valid ID extracted)`
      )
    } catch (error: any) {
      console.error(
        `✗ Attempt ${attempt + 1}/${strategies.length} failed for "${title}": ${
          error.message
        }`
      )

      // El fetcher ya reintenta por su cuenta (respetando Retry-After); aquí
      // solo se espacia el paso a la siguiente estrategia de búsqueda según la
      // causa: rate limit espera de más, un 404 sin coincidencia no espera.
      if (error instanceof FetchError && error.kind === 'rate_limit') {
        const waitTime = 5000 * (attempt + 1) // 5s, 10s, 15s, etc.
        console.log(`⏳ Rate limit hit, waiting ${waitTime / 1000}s...`)
        await new Promise((resolve) => setTimeout(resolve, waitTime))
      } else if (!(error instanceof FetchError && error.kind === 'not_found')) {
        // Para otros errores, esperar menos
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }
  }

  console.log(
    `✗ No match found for "${title}" after ${strategies.length} attempts`
  )
  return null
}
