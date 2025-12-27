// Root response
export interface TvdbSeriesResponse {
  data: TvdbSeries
  status: string
}

// Series core
export interface TvdbSeries {
  abbreviation: string
  airsDays: TvdbAirsDays
  airsTime: string
  aliases: TvdbAlias[]
  artworks: TvdbSeriesArtwork[]
  averageRuntime: number
  characters: TvdbCharacter[]
  contentRatings: TvdbContentRating[]
  country: string
  defaultSeasonType: number
  episodes: TvdbEpisode[]
  firstAired: string
  lists: TvdbList[]
  genres: TvdbGenre[]
  id: number
  image: string
  isOrderRandomized: boolean
  lastAired: string
  lastUpdated: string
  name: string
  nameTranslations: string[]
  companies: TvdbCompany[] // series‑level companies
  nextAired: string
  originalCountry: string
  originalLanguage: string
  originalNetwork: TvdbCompany // network shape
  overview: string
  latestNetwork: TvdbCompany
  overviewTranslations: string[]
  remoteIds: TvdbRemoteId[]
  score: number
  seasons: TvdbSeason[]
  seasonTypes: TvdbSeasonType[]
  slug: string
  status: TvdbStatus
  tags: TvdbTagOption[]
  trailers: TvdbTrailer[]
  translations: TvdbTranslations
  year: string
}

// Airing days
export interface TvdbAirsDays {
  friday: boolean
  monday: boolean
  saturday: boolean
  sunday: boolean
  thursday: boolean
  tuesday: boolean
  wednesday: boolean
}

// Reused simple pieces (same shapes as in movie schema you sent)
export interface TvdbAlias {
  language: string
  name: string
}

export interface TvdbTagOption {
  helpText: string
  id: number
  name: string
  tag: number
  tagName: string
}

export interface TvdbRemoteId {
  id: string
  type: number
  sourceName: string
}

export interface TvdbGenre {
  id: number
  name: string
  slug: string
}

export interface TvdbStatus {
  id: number
  keepUpdated: boolean
  name: string
  recordType: string
}

export interface TvdbContentRating {
  id: number
  name: string
  description: string
  country: string
  contentType: string
  order: number
  fullName: string
}

// Artwork (series level)
export interface TvdbSeriesArtwork {
  episodeId: number
  height: number
  id: number
  image: string
  includesText: boolean
  language: string
  movieId: number
  networkId: number
  peopleId: number
  score: number
  seasonId: number
  seriesId: number
  seriesPeopleId: number
  status: {
    id: number
    name: string
  }
  tagOptions: TvdbTagOption[]
  thumbnail: string
  thumbnailHeight: number
  thumbnailWidth: number
  type: number
  updatedAt: number
  width: number
}

// Companies
export interface TvdbCompany {
  activeDate: string
  aliases: TvdbAlias[]
  country: string
  id: number
  inactiveDate: string
  name: string
  nameTranslations: string[]
  overviewTranslations: string[]
  primaryCompanyType: number
  slug: string
  parentCompany: TvdbParentCompany | null
  tagOptions: TvdbTagOption[]
}

export interface TvdbParentCompany {
  id: number
  name: string
  relation: {
    id: number
    typeName: string
  }
}

// Characters (same shape as movie characters)
export interface TvdbCharacter {
  aliases: TvdbAlias[]
  episode: TvdbCharacterRef | null
  episodeId: number
  id: number
  image: string
  isFeatured: boolean
  movieId: number
  movie: TvdbCharacterRef | null
  name: string
  nameTranslations: string[]
  overviewTranslations: string[]
  peopleId: number
  personImgURL: string
  peopleType: string
  seriesId: number
  series: TvdbCharacterRef | null
  sort: number
  tagOptions: TvdbTagOption[]
  type: number
  url: string
  personName: string
}

export interface TvdbCharacterRef {
  image: string
  name: string
  year: string
}

// Episodes
export interface TvdbEpisode {
  absoluteNumber: number
  aired: string
  airsAfterSeason: number
  airsBeforeEpisode: number
  airsBeforeSeason: number
  finaleType: string
  id: number
  image: string
  imageType: number
  isMovie: number
  lastUpdated: string
  linkedMovie: number
  name: string
  nameTranslations: string[]
  number: number
  overview: string
  overviewTranslations: string[]
  runtime: number
  seasonNumber: number
  seasons: TvdbSeasonInEpisode[]
  seriesId: number
  seasonName: string
  year: string
}

// Season as embedded in episode
export interface TvdbSeasonInEpisode {
  id: number
  image: string
  imageType: number
  lastUpdated: string
  name: string
  nameTranslations: string[]
  number: number
  overviewTranslations: string[]
  companies: TvdbSeasonCompanies
  seriesId: number
  type: TvdbSeasonType
  year: string
}

// Season as top‑level
export interface TvdbSeason {
  id: number
  image: string
  imageType: number
  lastUpdated: string
  name: string
  nameTranslations: string[]
  number: number
  overviewTranslations: string[]
  companies: TvdbSeasonCompanies
  seriesId: number
  type: TvdbSeasonType
  year: string
}

// Season company collections
export interface TvdbSeasonCompanies {
  studio: TvdbCompany[]
  network: TvdbCompany[]
  production: TvdbCompany[]
  distributor: TvdbCompany[]
  special_effects: TvdbCompany[]
}

// Season type
export interface TvdbSeasonType {
  alternateName: string
  id: number
  name: string
  type: string
}

// Lists (same as movie lists)
export interface TvdbList {
  aliases: TvdbAlias[]
  id: number
  image: string
  imageIsFallback: boolean
  isOfficial: boolean
  name: string
  nameTranslations: string[]
  overview: string
  overviewTranslations: string[]
  remoteIds: TvdbRemoteId[]
  tags: TvdbTagOption[]
  score: number
  url: string
}

// Trailers
export interface TvdbTrailer {
  id: number
  language: string
  name: string
  url: string
  runtime: number
}

// Translations block
export interface TvdbTranslations {
  nameTranslations: TvdbTranslationEntry[]
  overviewTranslations: TvdbTranslationEntry[]
  alias: string[]
}

export interface TvdbTranslationEntry {
  aliases: string[]
  isAlias: boolean
  isPrimary: boolean
  language: string
  name: string
  overview: string
  tagline: string
}
