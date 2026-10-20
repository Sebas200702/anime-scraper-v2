import { CONFIG } from '../config/config.js'
import { fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ProxyTarget } from '../libs/transport.js'
import type { ScrapingTask } from 'types/index.js'

/**
 * Reparto **completo** de un anime según la API oficial de MAL
 * (`/v2/anime/{id}/characters`).
 *
 * La ficha HTML de MAL solo enseña los diez primeros personajes de la
 * sección "Characters and Voice Actors"; la API v2 devuelve la lista entera
 * paginada (100 por página, con `paging.next` para seguir).
 *
 * Cada entrada trae el **id de MAL del personaje** (que es un id de persona) y
 * su rol (`Main` / `Supporting`).
 */

export interface MalCharacterEntry {
  characterId: number
  role: string
}

export interface MalCharactersPayload {
  animeId: number
  characters: MalCharacterEntry[]
}

export const fetchMalCharacters = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<MalCharactersPayload> => {
  const { animeId } = task.payload as { animeId?: number }
  if (!animeId) throw new SkippedTaskError('missing:animeId')

  const clientId = CONFIG.MAL_CLIENT_ID
  if (!clientId) throw new SkippedTaskError('missing:MAL_CLIENT_ID')

  const characters: MalCharacterEntry[] = []
  let next: string | null =
    `${CONFIG.MAL_API_BASE}/anime/${animeId}/characters?limit=100&nsfw=true`

  while (next) {
    const response: {
      data?: { node?: { id?: number }; role?: string }[]
      paging?: { next?: string | null }
    } = await fetcher<{
      data?: { node?: { id?: number }; role?: string }[]
      paging?: { next?: string | null }
    }>({
      url: next,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-MAL-CLIENT-ID': clientId,
      },
      agent: proxy,
      timeoutMs: 20_000,
    })

    for (const entry of response.data ?? []) {
      const id = entry.node?.id
      if (!id) continue
      characters.push({ characterId: id, role: entry.role ?? 'Supporting' })
    }

    // La API pagina con la URL completa: se respeta tal cual (lleva el
    // client-id en la query y no se puede rehacer a mano).
    const raw = response.paging?.next
    next = raw
      ? raw.replace(/^https?:\/\/api\.myanimelist\.net/, CONFIG.MAL_API_BASE)
      : null
    if (characters.length > 2_000) break
  }

  return { animeId, characters }
}
