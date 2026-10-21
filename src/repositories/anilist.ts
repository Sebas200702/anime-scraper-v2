import { eq, inArray } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { anime } from '../schemas/anime.js'
import { animeRelatedAnime } from '../schemas/animeRelations.js'
import { batchUpsert } from '../shared/batchUpsert.js'
import { filterByExistingFk } from '../shared/fkFilter.js'
import { mediaRepository } from './media.js'
import { unique } from '../utils/deduplicate.js'
import { chunk, MAX_PARAMS_PER_STATEMENT } from '../utils/chunk.js'
import type {
  AnimeBannersProcessorResult,
  AnimeCatalogProcessorResult,
  AnimePatch,
  NewAnimeRelatedAnime,
  NewMedia,
} from '../types/index.js'

const patchColumns = (patch: AnimePatch): Record<string, unknown> => {
  const cols: Record<string, unknown> = {}
  if (patch.trailerYoutubeId !== undefined)
    cols.trailerYoutubeId = patch.trailerYoutubeId
  if (patch.trailerEmbedUrl !== undefined)
    cols.trailerEmbedUrl = patch.trailerEmbedUrl
  if (patch.source !== undefined) cols.source = patch.source
  // ISO `YYYY-MM-DD` → timestamptz (medianoche UTC).
  if (patch.airedFrom !== undefined) cols.airedFrom = new Date(patch.airedFrom)
  if (patch.airedTo !== undefined) cols.airedTo = new Date(patch.airedTo)
  if (patch.synopsis !== undefined) cols.synopsis = patch.synopsis
  if (patch.broadcastDay !== undefined) cols.broadcastDay = patch.broadcastDay
  if (patch.broadcastTime !== undefined)
    cols.broadcastTime = patch.broadcastTime
  if (patch.broadcastTimezone !== undefined)
    cols.broadcastTimezone = patch.broadcastTimezone
  return cols
}

export const anilistRepository = {
  /** Ids de `anime` que existen (el bulk trae anime fuera de nuestro catálogo). */
  async knownAnimeIds(ids: number[]): Promise<Set<number>> {
    const known = new Set<number>()
    const uniqueIds = [...new Set(ids)]
    for (const batch of chunk(uniqueIds, MAX_PARAMS_PER_STATEMENT)) {
      const rows = await db
        .select({ malId: anime.malId })
        .from(anime)
        .where(inArray(anime.malId, batch))
      for (const row of rows) known.add(row.malId)
    }
    return known
  },

  /** Backfill en bulk: una página trae 50 anime; se guardan todos de una vez. */
  async saveAnilistCatalog(
    results: AnimeCatalogProcessorResult[]
  ): Promise<number> {
    const flat = results.flatMap((r) => r.results ?? [])
    // AniList conoce anime que nuestro catálogo (MAL) no tiene: sus filas
    // romperían las FK de `anime_media`/`anime_relation` (y hacían fallar la
    // tarea entera). Se descartan antes de escribir.
    const idOf = (r: AnimeBannersProcessorResult): number | undefined =>
      r.animePatch?.malId ??
      r.animeMedias[0]?.entityId ??
      r.animeRelations?.[0]?.animeId
    const known = await this.knownAnimeIds(
      flat.map(idOf).filter((id): id is number => typeof id === 'number')
    )
    const filtered = flat.filter((r) => {
      const id = idOf(r)
      return id === undefined || known.has(id)
    })

    return await this.saveAnimeBanners(filtered)
  },

  async saveAnimeBanners(
    results: AnimeBannersProcessorResult[]
  ): Promise<number> {
    const banners: NewMedia[] = []
    const relations: NewAnimeRelatedAnime[] = []
    let patched = 0
    for (const result of results) {
      if (result?.animeMedias) banners.push(...result.animeMedias)
      if (result?.animeRelations) relations.push(...result.animeRelations)
      // Parche disperso: solo las columnas presentes (nunca nulls).
      if (result?.animePatch) {
        const cols = patchColumns(result.animePatch)
        if (Object.keys(cols).length > 0) {
          await db
            .update(anime)
            .set(cols)
            .where(eq(anime.malId, result.animePatch.malId))
          patched++
        }
      }
    }

    const uniqueBanners = unique(
      banners,
      (banner) => `${banner.entityId}:${banner.mediaType}:${banner.src}`
    )
    const uniqueRelations = unique(
      relations,
      (r) => `${r.animeId}:${r.relatedAnimeId}:${r.relationType}`
    )
    // La junction exige anime en ambos lados: lo que aún no existe se descarta
    // en silencio (no difiere la tarea: la relation es **decorativa**, el
    // banner/sinopsis/stats de esta tarea sí deben guardarse).
    const validRelations = await filterByExistingFk(
      uniqueRelations,
      (r) => r.relatedAnimeId,
      anime,
      anime.malId,
      false
    )

    const [saved, relSaved] = await Promise.all([
      mediaRepository.saveMedia(uniqueBanners, 'anilist'),
      batchUpsert(animeRelatedAnime, validRelations, 3, 'anime-relations'),
    ])
    return saved + patched + relSaved
  },
}
