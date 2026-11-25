import type {
  AniListMediaDeep,
  AniListStaffEdge,
} from '../src/services/anilistMedia.js'
import { MAL_OFFSET, script } from './anilistMediaBatchFixtures.js'

/** Fichas del AniList simulado (T11, L21). */
const charEdge = (id: number) => ({
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
const staffEdge = (id: number): AniListStaffEdge => ({
  role: 'Director',
  node: {
    id,
    name: { full: `Batch Staff ${id}`, native: null, alternative: null },
    gender: null,
    dateOfBirth: null,
    favourites: null,
  },
})

/** Ids de nodo `anilistId × 100 + i` (i = 1…total), en orden. */
const slice = <E>(
  id: number,
  total: number,
  page: number,
  per: number,
  make: (n: number) => E
) => ({
  pageInfo: { total, hasNextPage: page * per < total },
  edges: Array.from(
    { length: Math.max(0, Math.min(per, total - (page - 1) * per)) },
    (_, i) => make(id * 100 + (page - 1) * per + i + 1)
  ),
})

/** Ficha de `anilistId` (idMal = anilistId − MAL_OFFSET) con páginas de `per`. */
export const deepMedia = (
  id: number,
  charPage = 1,
  staffPage = 1,
  per = 50
): AniListMediaDeep => ({
  id,
  idMal: id - MAL_OFFSET,
  type: 'ANIME',
  characters: slice(id, script.chars?.[id] ?? 1, charPage, per, charEdge),
  staff: slice(id, script.staff?.[id] ?? 0, staffPage, per, staffEdge),
  relations: { edges: [] },
  externalLinks: [
    {
      id,
      site: 'Official Site',
      url: `https://batch.test/${id}`,
      type: 'INFO',
    },
  ],
})
