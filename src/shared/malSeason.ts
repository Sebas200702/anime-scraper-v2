/** Temporadas de MAL: winter = ene–mar, spring = abr–jun, summer = jul–sep, fall = oct–dic. */
export const MAL_SEASONS = ['winter', 'spring', 'summer', 'fall'] as const

export type MalSeasonName = (typeof MAL_SEASONS)[number]

export interface MalSeason {
  year: number
  season: MalSeasonName
}

/**
 * Temporada de MAL en `date` (UTC) desplazada `offset` temporadas. Cruza el
 * año correctamente: la siguiente de fall Y es winter Y+1.
 */
export const malSeasonAt = (date: Date, offset = 0): MalSeason => {
  const index =
    date.getUTCFullYear() * 4 + Math.floor(date.getUTCMonth() / 3) + offset
  return {
    year: Math.floor(index / 4),
    season: MAL_SEASONS[((index % 4) + 4) % 4]!,
  }
}
