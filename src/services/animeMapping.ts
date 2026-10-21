import { kitsuMapping, kitsuMappingsByAnimeId, tvdbMapping } from './mapping.js'
import {
  pickTvdbId,
  type KitsuMappingsResponse,
} from '../shared/kitsuMappings.js'
import { mapWithRetry } from '../utils/mapWithRetry.js'
import { createRateLimiter } from '../utils/rateLimit.js'
import type { ScrapingTask } from 'types/index.js'
import type { ProxyTarget } from '../libs/transport.js'

// Techo agregado para el backfill (10 IPs): la cuota por IP la sigue aplicando
// el `RateGate` por (host, IP). El 1/s anterior serializaba todas las búsquedas
// aunque hubiera 100 IPs disponibles (fosil de la era worker_threads).
const kitsuLimiter = createRateLimiter(10, 600)
const tvdbLimiter = createRateLimiter(10, 600)

export const fetchAnimeMapping = async (
  task: ScrapingTask,
  agent: ProxyTarget
) => {
  const {
    title,
    title_english,
    title_japanese,
    title_synonyms,
    year,
    type,
    kitsu_id,
  } = task.payload as {
    title: string
    title_english?: string
    title_japanese?: string
    title_synonyms?: string[]
    year?: number
    type?: string
    kitsu_id?: number | null
  }
  // Extract the numeric malId from entityId (e.g. "anime_mapping_123" → 123)
  const malId = Number(task.entityId.replace('anime_mapping_', ''))
  const payload = {
    mal_id: malId,
    title,
    title_english,
    title_japanese,
    title_synonyms,
    year,
    type,
  }

  // Vía rápida (19.7k animes): el dump ya dio un kitsu_id curado; 1 request
  // directa a sus mappings resuelve el tvdb_id sin búsquedas por título (más
  // rápido Y más preciso que el fuzzy). Si falla, cae al slow path.
  if (typeof kitsu_id === 'number' && kitsu_id > 0) {
    try {
      await kitsuLimiter()
      const json = await kitsuMappingsByAnimeId(kitsu_id, agent)
      return { kitsuId: kitsu_id, tvdbId: pickTvdbId(json) }
    } catch {
      // Sigue al slow path (mismo recall que antes).
    }
  }

  // Slow path (11k sin kitsu_id): buscar SOLO en Kitsu (hasta 3 estrategias) y
  // sacar el tvdb_id de sus mappings. Antes se hacía además una búsqueda fuzzy
  // por título en TVDB en paralelo: 9 estrategias × 2 fuentes y, peor, un
  // `tvdb_id` adivinado por título. Ahora: 1-3 requests a Kitsu + 1 a mappings;
  // TVDB por título queda solo como último recurso si Kitsu no encuentra nada.
  const kitsuId = await mapWithRetry(
    payload,
    async (params, agent) => ({ json: await kitsuMapping(params, agent) }),
    kitsuLimiter,
    agent,
    3
  ).catch(() => null)

  if (kitsuId) {
    try {
      await kitsuLimiter()
      const json = await kitsuMappingsByAnimeId(kitsuId, agent)
      return { kitsuId, tvdbId: pickTvdbId(json) }
    } catch {
      return { kitsuId, tvdbId: null }
    }
  }

  const tvdbId = await mapWithRetry(
    payload,
    async (params, agent) => ({ json: await tvdbMapping(params, agent) }),
    tvdbLimiter,
    agent,
    3
  ).catch(() => null)

  return { kitsuId: null, tvdbId }
}
