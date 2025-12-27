// Root response
export interface TvdbMovieResponse {
  data: TvdbMovie
}

// Movie core
export interface TvdbMovie {
  aliases: TvdbAlias[]
  artworks: TvdbArtwork[]
  audioLanguages: string[]
  awards: TvdbAward[]
  boxOffice: string
  boxOfficeUS: string
  budget: string
  characters: TvdbCharacter[]
  companies: TvdbCompanies
  contentRatings: TvdbContentRating[]
  first_release: TvdbReleaseInfo
  genres: TvdbGenre[]
  id: number
  image: string
  inspirations: TvdbInspiration[]
  lastUpdated: string
  lists: TvdbList[]
  name: string
  nameTranslations: string[]
  originalCountry: string
  originalLanguage: string
  overviewTranslations: string[]
  production_countries: TvdbProductionCountry[]
  releases: TvdbReleaseInfo[]
  remoteIds: TvdbRemoteId[]
  runtime: number
  score: number
  slug: string
  spoken_languages: string[]
  status: TvdbStatus
  studios: TvdbStudioShort[]
  subtitleLanguages: string[]
}

// Simple subtypes
export interface TvdbAlias {
  language: string
  name: string
}

export interface TvdbArtwork {
  height: number
  id: number
  image: string
  includesText: boolean
  language: string
  score: number
  thumbnail: string
  type: number
  width: number
}

export interface TvdbAward {
  id: number
  name: string
}

export interface TvdbGenre {
  id: number
  name: string
  slug: string
}

export interface TvdbInspiration {
  id: number
  type: string
  type_name: string
  url: string
}

export interface TvdbProductionCountry {
  id: number
  country: string
  name: string
}

export interface TvdbRemoteId {
  id: string
  type: number
  sourceName: string
}

export interface TvdbStatus {
  id: number
  keepUpdated: boolean
  name: string
  recordType: string
}

export interface TvdbStudioShort {
  id: number
  name: string
  parentStudio: number
}

// Releases / first_release
export interface TvdbReleaseInfo {
  country: string
  date: string
  detail: string
}

// Content ratings
export interface TvdbContentRating {
  id: number
  name: string
  description: string
  country: string
  contentType: string
  order: number
  fullName: string
}

// Characters
export interface TvdbCharacter {
  aliases: TvdbAlias[]
  episode: TvdbCharacterEpisodeRef | null
  episodeId: number
  id: number
  image: string
  isFeatured: boolean
  movieId: number
  movie: TvdbCharacterMovieRef | null
  name: string
  nameTranslations: string[]
  overviewTranslations: string[]
  peopleId: number
  personImgURL: string
  peopleType: string
  seriesId: number
  series: TvdbCharacterSeriesRef | null
  sort: number
  tagOptions: TvdbTagOption[]
  type: number
  url: string
  personName: string
}

export interface TvdbCharacterEpisodeRef {
  image: string
  name: string
  year: string
}

export interface TvdbCharacterMovieRef {
  image: string
  name: string
  year: string
}

export interface TvdbCharacterSeriesRef {
  image: string
  name: string
  year: string
}

// Tag options (reused)
export interface TvdbTagOption {
  helpText: string
  id: number
  name: string
  tag: number
  tagName: string
}

// Companies block
export interface TvdbCompanies {
  studio: TvdbCompany[]
  network: TvdbCompany[]
  production: TvdbCompany[]
  distributor: TvdbCompany[]
  special_effects: TvdbCompany[]
}

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
  relation: TvdbCompanyRelation
}

export interface TvdbCompanyRelation {
  id: number
  typeName: string
}

// Lists
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
