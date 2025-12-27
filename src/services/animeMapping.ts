import { kitsuMapping, tvdbMapping } from './mapping.js'
import { mapWithRetry } from '../utils/mapWithRetry.js'
import { createRateLimiter } from '../utils/rateLimit.js'
import type { ScrapingTask } from 'types/index.js'
import type { ProxyAgent } from 'undici'

const kitsuLimiter = createRateLimiter(1, 40)
const tvdbLimiter = createRateLimiter(1, 40)

export const fetchAnimeMapping = async (
  task: ScrapingTask,
  agent: ProxyAgent
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
  const payload = {
    mal_id: task.entityId,
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
