/**
 * Re-exports all Jikan processors from their focused sub-modules.
 * This file maintains backward compatibility with the dynamic import
 * convention used by GenericManager: `import(`../processors/${sourceName}.js`)`
 */
import type {
  JikanResponse,
  Anime,
  Character,
  Staff,
  Producer,
} from '../types/jikanApi.js'
import type { ScrapingTask } from '../types/index.js'
import { mapAnime } from './jikan/animeMapper.js'
import { mapCharacter } from './jikan/characterMapper.js'
import { mapStaff } from './jikan/staffMapper.js'
import { mapProducer } from './jikan/producerMapper.js'

export { mapCharacter } from './jikan/characterMapper.js'

export const processAnime = (
  rawData: JikanResponse<Anime>,
  _task: ScrapingTask
) => (rawData.data || []).map(mapAnime)

export const processCharacter = (
  rawData: JikanResponse<Character>,
  _task: ScrapingTask
) => (rawData.data || []).map(mapCharacter)

export const processStaff = (
  rawData: JikanResponse<Staff>,
  _task: ScrapingTask
) => (rawData.data || []).map(mapStaff)

export const processProducer = (
  rawData: JikanResponse<Producer>,
  _task: ScrapingTask
) => (rawData.data || []).map(mapProducer)
