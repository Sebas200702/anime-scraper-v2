import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { CONFIG } from '../src/config/config.js'
import type { ScrapingTask } from '../src/types/index.js'
import type {
  AniListCharacterEdge,
  AniListMediaDeep,
} from '../src/services/anilistMedia.js'

/**
 * AniList simulado para T11 (S6, L19): responde la query por alias (`m0`…) y
 * la de un solo medio (`Media`). Nunca toca el AniList real.
 */
export const MAL_OFFSET = 100_000

export interface Script {
  /** HTTP de error para la query por alias (429, 404, 503…). */
  batchStatus?: number
  /** Errores GraphQL extra de la query por alias. */
  errors?: { message: string; path?: (string | number)[] }[]
  /** anilistId que vuelven `null` en su alias (o `Media`). */
  nulls?: number[]
  /** anilistId con una segunda página de personajes. */
  more?: number[]
}

export const script: Script = {}
export const requests: { query: string; variables: Record<string, any> }[] = []

const edge = (id: number): AniListCharacterEdge => ({
  role: 'MAIN',
  node: {
    id,
    name: { full: `Batch Char ${id}`, native: null, alternative: [] },
    image: null,
    description: null,
    gender: null,
    dateOfBirth: null,
    bloodType: null,
    age: null,
    favourites: null,
  },
  voiceActors: [],
})

/** Ficha de `anilistId`: idMal = anilistId − MAL_OFFSET, un personaje por página. */
export const deepMedia = (anilistId: number, page = 1): AniListMediaDeep => ({
  id: anilistId,
  idMal: anilistId - MAL_OFFSET,
  type: 'ANIME',
  characters: {
    pageInfo: {
      total: 2,
      hasNextPage: page === 1 && Boolean(script.more?.includes(anilistId)),
    },
    // Dos páginas: la tercera vuelve vacía (así corta el paginador).
    edges: page <= 2 ? [edge(anilistId * 10 + page)] : [],
  },
  staff: { pageInfo: { total: 0, hasNextPage: false }, edges: [] },
  relations: { edges: [] },
  externalLinks: [
    {
      id: anilistId,
      site: 'Official Site',
      url: `https://batch.test/${anilistId}`,
      type: 'INFO',
    },
  ],
})

const media = (id: number, page = 1) =>
  script.nulls?.includes(id) ? null : deepMedia(id, page)

const reply = (variables: Record<string, any>) => {
  if (!('i0' in variables)) {
    const { id, charPage } = variables
    return { status: 200, body: { data: { Media: media(id, charPage) } } }
  }
  const data: Record<string, unknown> = {}
  for (const [name, id] of Object.entries(variables))
    if (name.startsWith('i')) data[`m${name.slice(1)}`] = media(id)
  if (script.batchStatus && script.batchStatus !== 200)
    return { status: script.batchStatus, body: { data, errors: script.errors } }
  return { status: 200, body: { data, errors: script.errors } }
}

let server: Server | undefined
const original = CONFIG.ANILIST_BASE

export const startAnilist = async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
    })
    req.on('end', () => {
      const body = JSON.parse(raw)
      requests.push(body)
      const { status, body: out } = reply(body.variables)
      res.writeHead(status, {
        'content-type': 'application/json',
        'retry-after': '0',
      })
      res.end(JSON.stringify(out))
    })
  })
  const port = await new Promise<number>((resolve) =>
    server!.listen(0, '127.0.0.1', () =>
      resolve((server!.address() as AddressInfo).port)
    )
  )
  ;(CONFIG as { ANILIST_BASE: string }).ANILIST_BASE =
    `http://127.0.0.1:${port}`
}

export const stopAnilist = () => {
  ;(CONFIG as { ANILIST_BASE: string }).ANILIST_BASE = original
  server?.close()
}

export const resetScript = () => {
  for (const key of Object.keys(script)) delete script[key as keyof Script]
  requests.length = 0
}

/** Tarea `anilistMedia` (sin anilistId si no se pasa). */
export const task = (id: number, anilistId?: number) =>
  ({
    id,
    taskType: 'media_anilist_details_hydration',
    payload: {
      anilistId,
      mediaId: (anilistId ?? 0) - MAL_OFFSET,
      mediaType: 'ANIME',
    },
  }) as unknown as ScrapingTask
