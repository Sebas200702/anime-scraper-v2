import { CONFIG } from '../config/config.js'
import { fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ProxyTarget } from '../libs/transport.js'
import type { ScrapingTask } from 'types/index.js'

/**
 * Ficha completa de una obra impresa en la API oficial de MAL
 * (`/v2/manga/{id}`).
 *
 * La API v2 cubre manga, novela y one-shot con el mismo endpoint (el
 * `media_type` distingue). Aporta lo que AniList no da: **sinopsis**,
 * **background**, **nº de capítulos/volúmenes**, **serialización** (revista),
 * **editorial** (studios/licensors/producers), **géneros y temas con su
 * matiz**, **enlaces externos** y las **obras relacionadas** con su tipo.
 */

/** Campos que se piden a la API v2 de MAL para una obra impresa. */
const MANGA_FIELDS = [
  'id',
  'title',
  'main_picture',
  'alternative_titles',
  'start_date',
  'end_date',
  'synopsis',
  'background',
  'media_type',
  'status',
  'genres',
  'num_chapters',
  'num_volumes',
  'related_manga',
  'source',
  'studios',
  'licensors',
  'producers',
  'serialization',
  'external_links',
  'theme',
  'popularity',
  'members',
  'mean',
  'scoring_type',
].join(',')

export interface MalMangaNode {
  id: number
  title?: string
  main_picture?: { medium?: string; large?: string }
  alternative_titles?: {
    en?: string
    ja?: string
    synonyms?: string[]
  }
  start_date?: string | null
  end_date?: string | null
  synopsis?: string | null
  background?: string | null
  media_type?: string
  status?: string
  genres?: { id: number; name: string }[]
  num_chapters?: number | null
  num_volumes?: number | null
  related_manga?: {
    id: number
    relation_type?: string
    node?: { id: number }
  }[]
  source?: string | null
  studios?: { id: number; node?: { id: number; name?: string } }[]
  licensors?: { id: number; node?: { id: number; name?: string } }[]
  producers?: { id: number; node?: { id: number; name?: string } }[]
  serialization?: {
    id?: number
    name?: string
    node?: { id: number; name?: string }
  }[]
  external_links?: {
    id: number
    name?: string
    url?: string
    type?: string
  }[]
  theme?: { id: number; name: string; category?: string }[]
  popularity?: number
  members?: number
  mean?: number
}

export interface MalMangaPayload {
  mangaId: number
  node: MalMangaNode
}

export const fetchMalManga = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<MalMangaPayload> => {
  const { mangaId } = task.payload as { mangaId?: number }
  if (!mangaId) throw new SkippedTaskError('missing:mangaId')

  const clientId = CONFIG.MAL_CLIENT_ID
  if (!clientId) throw new SkippedTaskError('missing:MAL_CLIENT_ID')

  const node = await fetcher<MalMangaNode>({
    url: `${CONFIG.MAL_API_BASE}/manga/${mangaId}?fields=${MANGA_FIELDS}&nsfw=true`,
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-MAL-CLIENT-ID': clientId,
    },
    agent: proxy,
    timeoutMs: 20_000,
  })

  if (!node?.id) throw new Error(`MAL: manga/${mangaId} sin datos`)
  return { mangaId, node }
}
