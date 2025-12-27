export interface JikanAnimeFullResponse {
  data: JikanAnime
}

export interface JikanAnime {
  mal_id: number
  url: string
  images: JikanImages
  trailer: JikanTrailer
  approved: boolean
  titles: JikanTitle[]
  title: string
  title_english: string | null
  title_japanese: string | null
  title_synonyms: string[]
  type: string
  source: string
  episodes: number | null
  status: string
  airing: boolean
  aired: JikanAired
  duration: string
  rating: string | null
  score: number | null
  scored_by: number | null
  rank: number | null
  popularity: number | null
  members: number
  favorites: number
  synopsis: string | null
  background: string | null
  season: string | null
  year: number | null
  broadcast: JikanBroadcast | null
  producers: JikanEntityRef[]
  licensors: JikanEntityRef[]
  studios: JikanEntityRef[]
  genres: JikanGenreTag[]
  explicit_genres: JikanGenreTag[]
  themes: JikanGenreTag[]
  demographics: JikanGenreTag[]
  relations: JikanRelation[]
  theme: JikanMusicThemes
  external: JikanExternalLink[]
  streaming: JikanStreamingLink[]
}

export interface JikanImages {
  jpg: JikanImageSet
  webp: JikanImageSet
}

export interface JikanImageSet {
  image_url: string | null
  small_image_url: string | null
  large_image_url: string | null
}

export interface JikanTrailer {
  youtube_id: string | null
  url: string | null
  embed_url: string | null
  images: {
    image_url: string | null
    small_image_url: string | null
    medium_image_url: string | null
    large_image_url: string | null
    maximum_image_url: string | null
  }
}

export interface JikanTitle {
  type: string
  title: string
}

export interface JikanAired {
  from: string | null
  to: string | null
  prop: {
    from: JikanAiredPropDate | null
    to: JikanAiredPropDate | null
  }
  string: string
}

export interface JikanAiredPropDate {
  day: number | null
  month: number | null
  year: number | null
}

export interface JikanBroadcast {
  day: string | null
  time: string | null
  timezone: string | null
  string: string | null
}

export interface JikanEntityRef {
  mal_id: number
  type: string
  name: string
  url: string
}

export interface JikanGenreTag {
  mal_id: number
  type: string
  name: string
  url: string
}

export interface JikanRelation {
  relation: string
  entry: JikanRelationEntry[]
}

export interface JikanRelationEntry {
  mal_id: number
  type: string
  name: string
  url: string
}

export interface JikanMusicThemes {
  openings: string[]
  endings: string[]
}

export interface JikanExternalLink {
  name: string
  url: string
}

export interface JikanStreamingLink {
  name: string
  url: string
}

export interface JikanAnimeCharactersResponse {
  data: JikanAnimeCharacterRelation[]
}

export interface JikanAnimeCharacterRelation {
  character: JikanCharacterMini
  role: string
  favorites: number
  voice_actors: JikanVoiceActorEntry[]
}

export interface JikanCharacterMini {
  mal_id: number
  url: string
  images: JikanCharacterImages
  name: string
}

export interface JikanCharacterImages {
  jpg: {
    image_url: string
  }
  webp?: {
    image_url: string
    small_image_url?: string
  }
}

export interface JikanVoiceActorEntry {
  person: JikanPersonMini
  language: string
}

export interface JikanPersonMini {
  mal_id: number
  url: string
  images: {
    jpg: {
      image_url: string
    }
  }
  name: string
}

export interface JikanAnimeStaffResponse {
  data: JikanAnimeStaffEntry[]
}

export interface JikanAnimeStaffEntry {
  person: JikanPersonMini
  positions: string[]
}

export interface JikanPersonMini {
  mal_id: number
  url: string
  images: JikanPersonImages
  name: string
}

export interface JikanPersonImages {
  jpg: {
    image_url: string
  }
}
