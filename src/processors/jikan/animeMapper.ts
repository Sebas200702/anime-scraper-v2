import type { AnimeProcessorResult, NewMedia } from '../../types/index.js'
import type { Anime } from '../../types/jikanApi.js'
import { extractMediaFromImages } from '../../shared/mediaExtractor.js'

export const mapAnime = (anime: Anime): AnimeProcessorResult => {
  const trailerMedia: NewMedia[] = []

  if (anime.trailer.url || anime.trailer.youtube_id || anime.trailer.embed_url) {
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
      year: anime.year || anime.aired.prop.from.year,
      season: anime.season,
      synopsis: anime.synopsis,
      background: anime.background,
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
