import type {
  AniListMediaDeep,
  AniListMediaType,
} from '../services/anilistMedia.js'
import type { ScrapingTask } from '../types/index.js'

/**
 * Mapea el pase profundo de AniList a las filas del catálogo.
 *
 * - **Reparto**: id de AniList, nombre (traducido y nativo), rol fino
 *   (`MAIN`/`SUPPORTING`/`BACKGROUND`) y sus voces japanesas.
 * - **Staff**: id de AniList, nombre, rol (`Director`, `Original Creator`…)
 *   y la nota del rol (`roleNote`).
 * - **Relaciones** y **enlaces externos**.
 */

/** Tipos de relación de AniList → los que usa el catálogo (estilo MAL). */
const RELATION_TYPES: Record<string, string> = {
  PREQUEL: 'prequel',
  SEQUEL: 'sequel',
  PARENT_STORY: 'parent story',
  SIDE_STORY: 'side story',
  ALTERNATIVE: 'alternative version',
  ALTERNATIVE_VERSION: 'alternative version',
  SUMMARY: 'other',
  ADAPTATION: 'other',
  CHARACTER: 'other',
  OTHER: 'other',
}

export const processAnilistMedia = (
  raw: { mediaType: AniListMediaType; media: AniListMediaDeep },
  _task: ScrapingTask
) => {
  const { mediaType, media } = raw
  const mediaId = media.idMal

  return {
    mediaType,
    mediaId,
    anilistId: media.id,
    characters: media.characters.edges.map((edge) => ({
      anilistId: edge.node.id,
      name: edge.node.name.full ?? edge.node.name.native ?? '',
      nativeName: edge.node.name.native,
      alternativeName: edge.node.name.alternative,
      role: edge.role.toUpperCase(),
      gender: edge.node.gender,
      birthYear: edge.node.dateOfBirth?.year ?? null,
      bloodType: edge.node.bloodType,
      height: edge.node.height,
      weight: edge.node.weight,
      age: edge.node.age,
      favourites: edge.node.favourites,
      voiceActors: edge.voiceActors.map((va) => ({
        anilistId: va.id,
        name: va.name.full ?? va.name.native ?? '',
        nativeName: va.name.native,
      })),
    })),
    staff: media.staff.edges.map((edge) => ({
      anilistId: edge.node.id,
      name: edge.node.name.full ?? edge.node.name.native ?? '',
      nativeName: edge.node.name.native,
      alternativeName: edge.node.name.alternative,
      role: edge.role,
      roleNote: edge.roleNote,
      gender: edge.node.gender,
      birthYear: edge.node.dateOfBirth?.year ?? null,
      favourites: edge.node.favourites,
    })),
    relations: media.relations.edges
      .filter((edge) => Boolean(edge.node.idMal))
      .map((edge) => ({
        relationType: RELATION_TYPES[edge.relationType] ?? 'other',
        relatedMalId: edge.node.idMal as number,
      })),
    externalLinks: media.externalLinks
      .filter((l) => Boolean(l.url))
      .map((l) => ({ site: l.site, url: l.url, type: l.type })),
  }
}

export type AniListMediaProcessorResult = ReturnType<typeof processAnilistMedia>
