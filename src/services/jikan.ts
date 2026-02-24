import { fetcher } from '../libs/fetcher.js'
import type { ProxyAgent } from 'undici'
import type { ScrapingTask } from 'types/index.js'
import { CONFIG } from '../config/config.js'
import type { JikanResponse, Anime , Character , Staff , Producer } from 'types/jikanApi.js'

const getPage = (task: ScrapingTask) => {
  const { page } = task.payload as { page: number }
  return page || 1
}

const fetchJikan = async <T>(url: string, agent?: ProxyAgent) => {
  const response = await fetcher<JikanResponse<T>>({
    url,
    method: 'GET',
    agent,
  })
  return response
}

export const fetchAnimePage = async (page: number, agent?: ProxyAgent) => {
  const url = `${CONFIG.JIKAN_BASE}/anime?page=${page}`
  return await fetchJikan<Anime>(url, agent)
}

export const fetchCharacterPage = async (page: number, agent?: ProxyAgent) => {
  const url = `${CONFIG.JIKAN_BASE}/characters?page=${page}`
  return await fetchJikan<Character>(url, agent)
}

export const fetchStaffPage = async (page: number, agent?: ProxyAgent) => {
  const url = `${CONFIG.JIKAN_BASE}/people?page=${page}`
  return await fetchJikan<Staff>(url, agent)
}

export const fetchProducerPage = async (page: number, agent?: ProxyAgent) => {
  const url = `${CONFIG.JIKAN_BASE}/producers?page=${page}`
  return await fetchJikan<Producer>(url, agent)
}

export const fetchAnime = async (task: ScrapingTask, agent?: ProxyAgent) => {
  const page = getPage(task)
  return await fetchAnimePage(page, agent)
}

export const fetchCharacter = async (task: ScrapingTask, agent?: ProxyAgent) => {
  const page = getPage(task)
  return await fetchCharacterPage(page, agent)
}

export const fetchStaff = async (task: ScrapingTask, agent?: ProxyAgent) => {
  const page = getPage(task)
  return await fetchStaffPage(page, agent)
}

export const fetchProducer = async (task: ScrapingTask, agent?: ProxyAgent) => {
  const page = getPage(task)
  return await fetchProducerPage(page, agent)
}
