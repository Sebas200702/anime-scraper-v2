import type { ProxyTarget } from '../libs/transport.js'
import type { ScrapingTask } from 'types/index.js'
import { fetchMediaDeep } from './anilistMedia/deepQuery.js'
import type {
  AniListMediaDeep,
  AniListMediaType,
} from './anilistMedia/types.js'

/**
 * Pase profundo por medio de AniList: reparto completo con sus voces, créditos
 * de staff, relaciones y enlaces externos.
 *
 * Es la única fuente que da el **reparto entero** (MAL limita la ficha a 10
 * personajes) y el reparto **por rol fino** (`MAIN` / `SUPPORTING` /
 * `BACKGROUND`). El reparto va paginado (50 por página) porque las series
 * largas llegan a cientos de personajes.
 *
 * Cuota: 30 req/min por IP; con el pool de proxies se multiplica. Con
 * `fetchBatchSize` (T11) el manager usa `fetchAnilistMediaBatch`: N medios por
 * request (`anilistMediaBatch.ts`).
 */

export type {
  AniListCharacterEdge,
  AniListMediaDeep,
  AniListMediaType,
  AniListStaffEdge,
} from './anilistMedia/types.js'
export { fetchAnilistMediaBatch } from './anilistMediaBatch.js'

export const fetchAnilistMedia = async (
  task: ScrapingTask,
  proxy?: ProxyTarget
): Promise<{ mediaType: AniListMediaType; media: AniListMediaDeep }> =>
  fetchMediaDeep(task, proxy)
