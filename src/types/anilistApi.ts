/** Respuesta de la API GraphQL de AniList para el banner de un anime. */
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
      title?: { romaji?: string | null } | null
    } | null
  }
  errors?: { message: string }[]
}
