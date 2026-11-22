import type {
  AniListMediaDeep,
  AniListMediaType,
} from '../services/anilistMedia.js'
import type { ScrapingTask } from '../types/index.js'
import {
  isRealAnilistImage,
  mapCastRole,
  mapRelationType,
  resolveCastMediaId,
} from '../utils/anilistCast.js'
import { nativeNameOrNull } from '../utils/characterName.js'

/**
 * Mapea el pase profundo de AniList a las filas del catálogo.
 *
 * - **Medio**: el id de la tarea (`payload.mediaId`); si el idMal de AniList no
 *   coincide, `mediaId` queda null y el repositorio no escribe nada.
 * - **Reparto**: id de AniList, nombre (completo, nativo solo si no es ASCII,
 *   alternativos), rol MAL (`Main`/`Supporting`/`Background`), retrato real y
 *   sus voces japonesas.
 * - **Staff**: id de AniList, nombre, rol (`Director`, `Original Creator`…).
 * - **Relaciones** (vocabulario MAL, mismo tipo de medio) y **enlaces**.
 */

const asList = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).filter(
    (v): v is string => typeof v === 'string' && v.trim() !== ''
  )

export const processAnilistMedia = (
  raw: { mediaType: AniListMediaType; media: AniListMediaDeep },
  task: ScrapingTask
) => {
  const { mediaType, media } = raw
  const payload = (task.payload ?? {}) as { mediaId?: number }
  const resolved = resolveCastMediaId(payload.mediaId, media.idMal)
  if ('mismatch' in resolved) {
    console.warn(
      `[anilistMedia] idMal mismatch: task ${mediaType} ${resolved.mismatch.taskMediaId} ≠ AniList ${media.id} idMal ${resolved.mismatch.anilistIdMal} — skipped`
    )
  }
  const mediaId = resolved.mediaId

  return {
    mediaType,
    mediaId,
    anilistId: media.id,
    characters: media.characters.edges.map((edge) => ({
      anilistId: edge.node.id,
      name: edge.node.name.full ?? edge.node.name.native ?? '',
      nativeName: nativeNameOrNull(edge.node.name.native),
      alternativeNames: asList(edge.node.name.alternative),
      image: isRealAnilistImage(edge.node.image?.large)
        ? (edge.node.image?.large as string)
        : null,
      description: edge.node.description,
      role: mapCastRole(edge.role),
      gender: edge.node.gender,
      birthYear: edge.node.dateOfBirth?.year ?? null,
      bloodType: edge.node.bloodType,
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
      gender: edge.node.gender,
      birthYear: edge.node.dateOfBirth?.year ?? null,
      favourites: edge.node.favourites,
    })),
    relations: media.relations.edges
      .filter((edge) => Boolean(edge.node.idMal))
      // Mismo tipo de medio (un tipo nulo no se sabe a qué tabla va) y nunca
      // una auto-relación, igual que `processors/anilist.ts`.
      .filter((edge) => edge.node.type === mediaType)
      .filter((edge) => edge.node.idMal !== (mediaId ?? media.idMal))
      .map((edge) => ({
        relationType: mapRelationType(edge.relationType, mediaType),
        relatedMalId: edge.node.idMal as number,
      })),
    externalLinks: media.externalLinks
      .filter((l) => Boolean(l.url))
      .map((l) => ({ site: l.site, url: l.url, type: l.type })),
  }
}

export type AniListMediaProcessorResult = ReturnType<typeof processAnilistMedia>
