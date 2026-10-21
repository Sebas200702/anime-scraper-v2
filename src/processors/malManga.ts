import type { MalMangaPayload } from '../services/malManga.js'
import type { ScrapingTask } from '../types/index.js'

/**
 * Convierte la ficha de una obra impresa de MAL en filas del catálogo.
 *
 * - La obra (`manga`) con sus campos de detalle.
 * - La taxonomía con los **ids de MAL** (géneros, temas y demográficas).
 * - Las empresas con su rol (`publisher`, `imprint`, `serialization`).
 * - Las obras relacionadas con su tipo de relación.
 * - Los enlaces externos (wiki, oficial, redes).
 * - La portada y los sinónimos.
 */

/** Roles con los que se guarda cada tipo de empresa de MAL. */
const PRODUCER_ROLES: Record<string, string> = {
  studios: 'publisher',
  licensors: 'imprint',
  producers: 'producer',
}

/** Sinónimos de la ficha: título inglés, japonés y sinónimos declarados. */
const synonymsOf = (node: MalMangaPayload['node']): string[] => {
  const alt = node.alternative_titles ?? {}
  return [alt.en, alt.ja, ...(alt.synonyms ?? [])].filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0
  )
}

/** Fecha de MAL (`2024-05-01`) a ISO con zona horaria. */
const toTimestamp = (value: string | null | undefined): string | null => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export const processMalManga = (raw: MalMangaPayload, _task: ScrapingTask) => {
  const { mangaId, node } = raw

  const producers = (['studios', 'licensors', 'producers'] as const).flatMap(
    (key) =>
      (node[key] ?? []).map((entry) => ({
        mangaId,
        producerId: entry.node?.id ?? entry.id,
        role: PRODUCER_ROLES[key] ?? 'producer',
        name: entry.node?.name ?? null,
      }))
  )

  // La serialización (revista) también es una empresa, con su propio rol.
  const serialization = node.serialization ?? []
  for (const entry of serialization) {
    const producerId = entry.node?.id ?? entry.id
    if (!producerId) continue
    producers.push({
      mangaId,
      producerId,
      role: 'serialization',
      name: entry.node?.name ?? entry.name ?? null,
    })
  }

  return {
    manga: {
      malId: mangaId,
      type: node.media_type ?? 'manga',
      title: node.title ?? `MAL ${mangaId}`,
      titleEnglish: node.alternative_titles?.en ?? null,
      titleJapanese: node.alternative_titles?.ja ?? null,
      status: node.status ?? null,
      chapters: node.num_chapters ?? null,
      volumes: node.num_volumes ?? null,
      score: node.mean ?? null,
      scoredBy: null,
      popularityRank: node.popularity ?? null,
      ranking: null,
      members: node.members ?? null,
      favorites: null,
      year: node.start_date ? Number(node.start_date.slice(0, 4)) : null,
      synopsis: node.synopsis ?? null,
      background: node.background ?? null,
      source: node.source ?? null,
      serialization:
        serialization[0]?.node?.name ?? serialization[0]?.name ?? null,
      duration: null,
      publishedFrom: toTimestamp(node.start_date),
      publishedTo: toTimestamp(node.end_date),
    },
    genres: (node.genres ?? []).map((g) => ({
      mangaId,
      genreId: g.id,
      name: g.name,
    })),
    themes: (node.theme ?? [])
      .filter((t) => (t.category ?? 'Theme') === 'Theme')
      .map((t) => ({ mangaId, themeId: t.id, name: t.name })),
    demographics: (node.theme ?? [])
      .filter((t) => t.category === 'Demographic')
      .map((t) => ({ mangaId, demographicId: t.id, name: t.name })),
    producers,
    relations: (node.related_manga ?? []).map((rel) => ({
      mangaId,
      relatedMangaId: rel.node?.id ?? rel.id,
      relationType: (rel.relation_type ?? 'OTHER').toUpperCase(),
    })),
    externalLinks: (node.external_links ?? [])
      .filter((l) => Boolean(l.url))
      .map((l) => ({
        mangaId,
        site: l.name ?? l.type ?? 'other',
        url: l.url as string,
        type: l.type ?? null,
      })),
    synonyms: synonymsOf(node),
    media: node.main_picture?.large
      ? [
          {
            mangaId,
            mediaType: 'cover',
            src: node.main_picture.large,
            size: 'large',
          },
          ...(node.main_picture.medium
            ? [
                {
                  mangaId,
                  mediaType: 'cover',
                  src: node.main_picture.medium,
                  size: 'medium',
                },
              ]
            : []),
        ]
      : [],
  }
}

export type MalMangaProcessorResult = ReturnType<typeof processMalManga>
