/** Respuesta de la API GraphQL de AniList para un anime (por `idMal`). */
export interface AniListBannerResponse {
  data?: {
    Media?: {
      id: number
      idMal: number | null
      bannerImage: string | null
      coverImage?: {
        extraLarge?: string | null
        large?: string | null
        color?: string | null
      } | null
      trailer?: { id?: string | null; site?: string | null } | null
      source?: string | null
      startDate?: FuzzyDate | null
      endDate?: FuzzyDate | null
      title?: { romaji?: string | null } | null
    } | null
  }
  errors?: { message: string }[]
}

/** Fecha parcial de AniList (año/mes/día opcionales). */
export interface FuzzyDate {
  year?: number | null
  month?: number | null
  day?: number | null
}
