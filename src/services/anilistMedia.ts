import { CONFIG } from '../config/config.js'
import { fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ProxyTarget } from '../libs/transport.js'
import type { ScrapingTask } from 'types/index.js'

/**
 * Pase profundo por medio de AniList: reparto completo con sus voces, créditos
 * de staff, relaciones y enlaces externos.
 *
 * Es la única fuente que da el **reparto entero** (MAL limita la ficha a 10
 * personajes) y el reparto **por rol fino** (`MAIN` / `SUPPORTING` /
 * `BACKGROUND`). El reparto va paginado (50 por página) porque las series
 * largas llegan a cientos de personajes.
 *
 * Cuota: 30 req/min por IP; con el pool de proxies se multiplica.
 */

export type AniListMediaType = 'ANIME' | 'MANGA'

export interface AniListCharacterEdge {
  role: string
  node: {
    id: number
    name: {
      full: string | null
      native: string | null
      alternative: string | null
    }
    gender: string | null
    dateOfBirth: { year: number | null } | null
    bloodType: string | null
    age: string | null
    favourites: number | null
  }
  voiceActors: {
    id: number
    name: { full: string | null; native: string | null }
  }[]
}

export interface AniListStaffEdge {
  role: string
  node: {
    id: number
    name: {
      full: string | null
      native: string | null
      alternative: string | null
    }
    gender: string | null
    dateOfBirth: { year: number | null } | null
    favourites: number | null
  }
}

export interface AniListMediaDeep {
  id: number
  idMal: number | null
  type: string
  characters: {
    pageInfo: { total: number; hasNextPage: boolean }
    edges: AniListCharacterEdge[]
  }
  staff: {
    pageInfo: { total: number; hasNextPage: boolean }
    edges: AniListStaffEdge[]
  }
  relations: {
    edges: {
      relationType: string
      node: { id: number; idMal: number | null; type: string }
    }[]
  }
  externalLinks: {
    id: number
    site: string
    url: string
    type: string | null
  }[]
}

const MEDIA_DEEP_QUERY = `query ($id: Int, $type: MediaType, $charPage: Int, $staffPage: Int) {
  Media(id: $id, type: $type) {
    id
    idMal
    type
    characters(page: $charPage, perPage: 50, sort: [ROLE, RELEVANCE, ID]) {
      pageInfo { total hasNextPage }
      edges {
        role
        node {
          id
          name { full native alternative }
          description(asHtml: false)
          gender
          dateOfBirth { year }
          bloodType
          age
          favourites
        }
        voiceActors(language: JAPANESE) { id name { full native } }
      }
    }
    staff(page: $staffPage, perPage: 50, sort: [RELEVANCE, ID]) {
      pageInfo { total hasNextPage }
      edges {
        role
        node {
          id
          name { full native alternative }
          description(asHtml: false)
          gender
          dateOfBirth { year }
          favourites
        }
      }
    }
    relations {
      edges { relationType node { id idMal type } }
    }
    externalLinks { id site url type }
  }
}`

export const fetchAnilistMedia = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<{ mediaType: AniListMediaType; media: AniListMediaDeep }> => {
  const { anilistId, mediaType } = task.payload as {
    anilistId?: number
    mediaType?: AniListMediaType
  }
  if (!anilistId) throw new SkippedTaskError('missing:anilistId')

  const type: AniListMediaType = mediaType === 'MANGA' ? 'MANGA' : 'ANIME'

  const query = async (charPage: number, staffPage: number) => {
    const response = await fetcher<{
      data?: { Media?: AniListMediaDeep | null }
      errors?: { message: string }[]
    }>({
      url: CONFIG.ANILIST_BASE,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'anime-scraper/2.0',
      },
      body: JSON.stringify({
        query: MEDIA_DEEP_QUERY,
        variables: { id: anilistId, type, charPage, staffPage },
      }),
      agent: proxy,
      // La latencia real por proxy es ~0,5 s (p90 1,2 s): 12 s es un margen
      // enorme y evita que un task lento alargue todo el lote.
      timeoutMs: 8_000,
    })
    if (response.errors?.length) {
      const message = response.errors[0]?.message ?? 'unknown error'
      if (/not found/i.test(message))
        throw new SkippedTaskError('anilist:not_found')
      throw new Error(`AniList: ${message}`)
    }
    return response.data?.Media ?? null
  }

  const first = await query(1, 1)
  if (!first) throw new SkippedTaskError('anilist:not_found')

  // El reparto y el staff van paginados: se piden las páginas que falten.
  const characters = [...first.characters.edges]
  let charPage = 1
  while (first.characters.pageInfo.hasNextPage && charPage < 20) {
    charPage++
    const page = await query(charPage, 1)
    if (!page) break
    characters.push(...page.characters.edges)
    if (page.characters.edges.length === 0) break
  }

  const staff = [...first.staff.edges]
  let staffPage = 1
  while (first.staff.pageInfo.hasNextPage && staffPage < 20) {
    staffPage++
    const page = await query(1, staffPage)
    if (!page) break
    staff.push(...page.staff.edges)
    if (page.staff.edges.length === 0) break
  }

  return {
    mediaType: type,
    media: {
      ...first,
      characters: {
        pageInfo: first.characters.pageInfo,
        edges: characters,
      },
      staff: {
        pageInfo: first.staff.pageInfo,
        edges: staff,
      },
    },
  }
}
