import type { ScrapingTask } from '../types/index.js'

/**
 * Prefijos de `entity_id` cuyo sufijo es el `mal_id` del anime. Los payloads
 * suelen traer `animeId`/`anime_id`, pero no todos (las tareas viejas o las de
 * listado), así que hay un fallback por nombre.
 */
const ENTITY_PREFIXES = [
  'anime_details_',
  'anime_characters_',
  'anime_staff_',
  'anime_episodes_',
  'anime_banner_',
  'anime_mapping_',
  'anime_malhtml_',
  'mal_details_',
  'mal_characters_',
  'mal_html_',
  'tvdb_artworks_',
  'tvdb_eps_',
  'tmdb_',
  'ann_',
] as const

const asPositiveInt = (value: unknown): number | undefined => {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

/**
 * `mal_id` del anime al que pertenece una tarea, si se puede determinar.
 *
 * Es lo que permite elegir intervalo airing vs. terminado por tarea. Las
 * tareas de personas, música, manga o listados devuelven `undefined` (no son
 * sensibles a emisión).
 */
export function animeIdForTask(
  task: Pick<ScrapingTask, 'entityId' | 'payload'>
): number | undefined {
  const payload = (task.payload ?? {}) as Record<string, unknown>
  const fromPayload =
    asPositiveInt(payload.animeId) ?? asPositiveInt(payload.anime_id)
  if (fromPayload) return fromPayload

  for (const prefix of ENTITY_PREFIXES) {
    if (!task.entityId.startsWith(prefix)) continue
    const id = asPositiveInt(task.entityId.slice(prefix.length))
    if (id) return id
  }

  return undefined
}
