export interface KitsuEpisodesResponse {
  data: Episodes[]
  meta: Meta2
  links: Links4
}

export interface Episodes {
  id: string
  type: string
  links: Links
  attributes: Attributes
  relationships: Relationships
}

export interface Links {
  self: string
}

export interface Attributes {
  createdAt: string
  updatedAt: string
  synopsis?: string
  description?: string
  titles: Titles
  canonicalTitle?: string
  seasonNumber?: number
  number: number
  relativeNumber: number
  airdate?: string
  length: number
  thumbnail?: Thumbnail
}

export interface Titles {
  en_jp?: string
  en_us?: string
  ja_jp?: string
}

export interface Thumbnail {
  original: string
  meta: Meta
}

export interface Meta {
  dimensions: Dimensions
}

export interface Dimensions {}

export interface Relationships {
  media: Media
  videos: Videos
}

export interface Media {
  links: Links2
}

export interface Links2 {
  self: string
  related: string
}

export interface Videos {
  links: Links3
}

export interface Links3 {
  self: string
  related: string
}

export interface Meta2 {
  count: number
}

export interface Links4 {
  first: string
  next: string
  last: string
}
