import { kitsuMapping, tvdbMapping } from './mapping.js'
import { mapWithRetry } from '../utils/mapWithRetry.js'
import { createRateLimiter } from '../utils/rateLimit.js'
import type { ScrapingTask } from 'types/index.js'
import type { ProxyTarget } from '../libs/transport.js'

// Fase 0: los limiters de módulo son **por worker** (cada thread importa su
// propia copia), así que se alinean con la cuota de Kitsu (60/min) en vez de
// escalarlos por concurrencia. La Fase 1 los reemplaza por un bucket global.
const kitsuLimiter = createRateLimiter(1, 50)
const tvdbLimiter = createRateLimiter(1, 50)

export const fetchAnimeMapping = async (
  task: ScrapingTask,
  agent: ProxyTarget
) => {
  const { title, title_english, title_japanese, title_synonyms, year, type } =
    task.payload as {
      title: string
      title_english?: string
      title_japanese?: string
      title_synonyms?: string[]
      year?: number
      type?: string
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

  const [kitsuId, tvdbId] = await Promise.all([
    mapWithRetry(
      payload,
      async (params, agent) => ({ json: await kitsuMapping(params, agent) }),
      kitsuLimiter,
      agent
    ).catch(() => null),
    mapWithRetry(
      payload,
      async (params, agent) => ({ json: await tvdbMapping(params, agent) }),
      tvdbLimiter,
      agent
    ).catch(() => null),
  ])

  return { kitsuId, tvdbId }
}
