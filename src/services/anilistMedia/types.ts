/** Tipos del pase profundo de AniList (`Media` con reparto y staff). */
export type AniListMediaType = 'ANIME' | 'MANGA'

export interface AniListCharacterEdge {
  role: string
  node: {
    id: number
    name: {
      full: string | null
      native: string | null
      /** AniList lo publica como lista (`[String]`). */
      alternative: (string | null)[] | null
    }
    image: { large: string | null } | null
    description: string | null
    gender: string | null
    dateOfBirth: { year: number | null } | null
    bloodType: string | null
    age: string | null
    favourites: number | null
  }
  voiceActors: {
    id: number
    name: { full: string | null; native: string | null }
  }[]
}

export interface AniListStaffEdge {
  role: string
  node: {
    id: number
    name: {
      full: string | null
      native: string | null
      alternative: string | null
    }
    gender: string | null
    dateOfBirth: { year: number | null } | null
    favourites: number | null
  }
}

export interface AniListMediaDeep {
  id: number
  idMal: number | null
  type: string
  characters: {
    pageInfo: { total: number; hasNextPage: boolean }
    edges: AniListCharacterEdge[]
  }
  staff: {
    pageInfo: { total: number; hasNextPage: boolean }
    edges: AniListStaffEdge[]
  }
  relations: {
    edges: {
      relationType: string
      node: { id: number; idMal: number | null; type: string }
    }[]
  }
  externalLinks: {
    id: number
    site: string
    url: string
    type: string | null
  }[]
}
