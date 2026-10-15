import { CONFIG } from '../config/config.js'

import { kisutTypeMapping, tvDbTypeMapping } from '../utils/typeMapping.js'
import { fetcher } from '../libs/fetcher.js'
import type { ProxyTarget } from '../libs/transport.js'
import { authenticate } from '../libs/tvdb.js'

export const kitsuMapping = async (
  query?: {
    title: string
    year?: number
    type?: keyof typeof kisutTypeMapping
  },
  agent?: ProxyTarget
) => {
  if (!query || !agent) {
    throw new Error('Missing query or agent')
  }
  const { title, year, type } = query

  const typeMapping = type ? kisutTypeMapping[type] : undefined

  let url = `${CONFIG.KITSU_BASE}/anime?filter[text]=${encodeURIComponent(
    title
  )}`

  if (year) {
    url += `&filter[seasonYear]=${year}`
  }
  if (typeMapping) {
    url += `&filter[subtype]=${typeMapping}`
  }

  const response = await fetcher({
    url,
    method: 'GET',
    headers: {
      Accept: 'application/vnd.api+json',
      'User-Agent': 'anime-scraper/1.0',
    },
    agent,
  })
  return response
}

export const tvdbMapping = async (
  query?: { title: string; year?: number; type?: keyof typeof tvDbTypeMapping },
  agent?: ProxyTarget
) => {
  if (!query || !agent) {
    throw new Error('Missing query or agent')
  }
  const { title, year, type } = query
  const typeMapping = type ? tvDbTypeMapping[type] : undefined

  const token = await authenticate()

  let url = `${CONFIG.TVDB_BASE}/search?query=${encodeURIComponent(title)}`
  if (year) {
    url += `&year=${year}`
  }
  if (typeMapping) {
    url += `&type=${typeMapping}`
  }

  const response = await fetcher({
    url,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'anime-scraper/1.0',
    },
    agent,
  })
  return response
}
