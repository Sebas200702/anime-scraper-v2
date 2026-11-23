import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { CONFIG } from '../src/config/config.js'
import { deepMedia } from './anilistMediaBatchMedia.js'

export { deepMedia } from './anilistMediaBatchMedia.js'
import type { ScrapingTask } from '../src/types/index.js'

/**
 * AniList simulado para T11 (S6, L19, L21): `Page { media(id_in:) }` (sin 404
 * por id ausente; conexiones anidadas topadas a 25 por medio) y `Media(id:)`
 * (50 por página). Nunca toca el AniList real.
 */
export const MAL_OFFSET = 100_000
const PAGE_CAP = 25

export interface Script {
  /** HTTP de error para la query `Page` (429, 503…). */
  batchStatus?: number
  /** Errores GraphQL de la query `Page`. */
  errors?: { message: string; path?: (string | number)[] }[]
  /** La query `Page` vuelve `data: null`. */
  noData?: boolean
  /** anilistId que AniList no conoce (ausentes de `media`, `Media` null). */
  missing?: number[]
  /** Personajes por anilistId (1 por defecto) y staff (0 por defecto). */
  chars?: Record<number, number>
  staff?: Record<number, number>
}

export const script: Script = {}
export const requests: { query: string; variables: Record<string, any> }[] = []

const known = (id: number) => !script.missing?.includes(id)

const reply = (variables: Record<string, any>) => {
  if (!('ids' in variables)) {
    const { id, charPage, staffPage } = variables
    return {
      status: 200,
      body: {
        data: { Media: known(id) ? deepMedia(id, charPage, staffPage) : null },
      },
    }
  }
  // Orden inverso a propósito: el servicio debe mapear por id, no por posición.
  const media = (variables.ids as number[])
    .filter(known)
    .reverse()
    .map((id) => deepMedia(id, 1, 1, PAGE_CAP))
  const data = script.noData ? null : { Page: { media } }
  return {
    status: script.batchStatus ?? 200,
    body: { data, errors: script.errors },
  }
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
export const task = (id: number, anilistId?: number, mediaType = 'ANIME') =>
  ({
    id,
    taskType: 'media_anilist_details_hydration',
    payload: { anilistId, mediaId: (anilistId ?? 0) - MAL_OFFSET, mediaType },
  }) as unknown as ScrapingTask
