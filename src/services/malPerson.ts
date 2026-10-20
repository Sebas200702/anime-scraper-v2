import { CONFIG } from '../config/config.js'
import { fetcher } from '../libs/fetcher.js'
import { SkippedTaskError } from '../libs/skippedTaskError.js'
import type { ProxyTarget } from '../libs/transport.js'
import type { ScrapingTask } from 'types/index.js'

/**
 * Ficha de persona de la API oficial de MAL (`/v2/people/{id}`).
 *
 * Sirve para **personajes y staff** por igual: en MAL ambos son "personas",
 * así que el id de personaje de una ficha de anime es un id de persona y su
 * ficha trae nombre, nombre nativo, biografía,Aliases y retrato.
 *
 * Ventaja frente a la ficha HTML: son ~1 KB por persona en vez de ~200 KB, y
 * el retrato viene en la respuesta. La versión grande se **deduce de la URL**
 * (MAL marca el thumbnail con una "t" antes de la extensión: `1t.jpg` →
 * `1.jpg`).
 */

/** Campos que se piden a la API v2 de MAL. */
const PERSON_FIELDS = [
  'id',
  'name',
  'given_name',
  'family_name',
  'native_name',
  'alternative_names',
  'biography',
  'image_url',
  'birthday',
  'death_date',
].join(',')

export interface MalPersonPayload {
  id: number
  name: string | null
  givenName: string | null
  familyName: string | null
  nativeName: string | null
  alternativeNames: string[]
  about: string | null
  imageUrl: string | null
  birthday: string | null
  deathDate: string | null
}

export const fetchMalPerson = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<{ person: MalPersonPayload; kind: 'staff' | 'character' }> => {
  const { personId, kind } = task.payload as {
    personId?: number
    kind?: 'staff' | 'character'
  }
  if (!personId) throw new SkippedTaskError('missing:personId')

  const clientId = CONFIG.MAL_CLIENT_ID
  if (!clientId) throw new SkippedTaskError('missing:MAL_CLIENT_ID')

  const response = await fetcher<{
    id: number
    name?: string
    given_name?: string
    family_name?: string
    native_name?: string
    alternative_names?: string[]
    biography?: string
    image_url?: string
    birthday?: string
    death_date?: string
  }>({
    url: `${CONFIG.MAL_API_BASE}/people/${personId}?fields=${PERSON_FIELDS}`,
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-MAL-CLIENT-ID': clientId,
    },
    agent: proxy,
    timeoutMs: 20_000,
  })

  return {
    person: {
      id: response.id ?? personId,
      name: response.name ?? null,
      givenName: response.given_name ?? null,
      familyName: response.family_name ?? null,
      nativeName: response.native_name ?? null,
      alternativeNames: response.alternative_names ?? [],
      about: response.biography ?? null,
      imageUrl: response.image_url ?? null,
      birthday: response.birthday ?? null,
      deathDate: response.death_date ?? null,
    },
    kind: kind === 'character' ? 'character' : 'staff',
  }
}

/**
 * Versión grande de un retrato de MAL.
 *
 * La API devuelve la miniatura (`.../1t.jpg`); la original es la misma ruta
 * sin la "t" (`.../1.jpg`). Si la URL no sigue el patrón, se devuelve tal cual.
 */
export const fullSizeImage = (url: string | null): string | null => {
  if (!url) return null
  if (!/^\d+t\.[a-z]+$/i.test(url.split('/').pop() ?? '')) return url
  return url.replace(/(\d+)t(\.[a-z]+)$/i, '$1$2')
}
