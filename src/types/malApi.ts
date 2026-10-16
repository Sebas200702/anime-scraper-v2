/** Tipos del payload de la MAL API oficial v2 (`/anime/{id}`). */
export interface MalAnimeDetails {
  id: number
  title?: string
  alternative_titles?: { synonyms?: string[]; en?: string; ja?: string }
  start_date?: string
  end_date?: string
  synopsis?: string
  background?: string
  mean?: number
  rank?: number
  popularity?: number
  num_list_users?: number
  num_scoring_users?: number
  genres?: { id: number; name: string }[]
  explicit_genres?: { id: number; name: string }[]
  themes?: { id: number; name: string }[]
  demographics?: { id: number; name: string }[]
  media_type?: string
  status?: string
  num_episodes?: number
  start_season?: { year?: number; season?: string }
  broadcast?: { day_of_the_week?: string; start_time?: string }
  source?: string
  average_episode_duration?: number
  rating?: string
  studios?: { id: number; name: string }[]
}
