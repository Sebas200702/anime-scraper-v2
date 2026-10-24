import type { AnimeProcessorResult, NewMedia } from '../../types/index.js'
import type { Anime } from '../../types/jikanApi.js'
import { extractMediaFromImages } from '../../shared/mediaExtractor.js'

/**
 * Fecha ISO de Jikan → `Date`, o `undefined` si no es una fecha válida.
 *
 * Se devuelve `undefined` (no `null`) a propósito: el mapper de refresh usa
 * `COALESCE`, así que omitir el campo conserva el valor que ya estaba en la DB
 * cuando la fuente aún no publica la fecha (`aired.to` de un airing, p. ej.).
 */
const toDate = (value?: string | null): Date | undefined => {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export const mapAnime = (anime: Anime): AnimeProcessorResult => {
  const trailerMedia: NewMedia[] = []

  if (
    anime.trailer.url ||
    anime.trailer.youtube_id ||
    anime.trailer.embed_url
  ) {
    trailerMedia.push({
      entityType: 'anime',
      mediaType: 'trailer',
      src:
        anime.trailer.url ||
        `https://www.youtube.com/watch?v=${anime.trailer.youtube_id}` ||
        anime.trailer.embed_url ||
        '',
      size: 'default',
      entityId: anime.mal_id,
    })
  }

  const imageMedia = extractMediaFromImages(
    anime.images,
    anime.mal_id,
    'anime',
    'poster'
  )

  return {
    anime: {
      malId: anime.mal_id,
      title: anime.title,
      titleEnglish: anime.title_english,
      titleJapanese: anime.title_japanese,
      type: anime.type,
      status: anime.status,
      episodes: anime.episodes,
      score: anime.score,
      scoredBy: anime.scored_by,
      popularityRank: anime.popularity,
      rating: anime.rating,
      year: anime.year || anime.aired?.prop?.from?.year,
      season: anime.season,
      synopsis: anime.synopsis,
      background: anime.background,
      // Cobertura (change `catalog-coverage-fields`): `/full` ya trae estos
      // campos y antes se descartaban. `aired_*` y `broadcast_*` son la base
      // del hot set del Modo B (ventana de emisión y día de estreno).
      broadcastDay: anime.broadcast?.day ?? undefined,
      broadcastTime: anime.broadcast?.time ?? undefined,
      broadcastTimezone: anime.broadcast?.timezone ?? undefined,
      airedFrom: toDate(anime.aired?.from),
      airedTo: toDate(anime.aired?.to),
      trailerYoutubeId: anime.trailer?.youtube_id ?? undefined,
      trailerEmbedUrl: anime.trailer?.embed_url ?? undefined,
      duration: anime.duration ?? undefined,
      source: anime.source ?? undefined,
      rank: anime.rank ?? undefined,
      members: anime.members ?? undefined,
      favorites: anime.favorites ?? undefined,
    },
    titleSynonyms: (anime.title_synonyms || []).map((title) => ({
      animeId: anime.mal_id,
      title,
    })),
    genres: (anime.genres || []).map((g) => ({
      malId: g.mal_id,
      name: g.name,
    })),
    demographics: (anime.demographics || []).map((d) => ({
      malId: d.mal_id,
      name: d.name,
      type: d.type,
    })),
    themes: (anime.themes || []).map((t) => ({
      malId: t.mal_id,
      name: t.name,
      type: t.type,
    })),
    animeMedias: [...trailerMedia, ...imageMedia],
  }
}
