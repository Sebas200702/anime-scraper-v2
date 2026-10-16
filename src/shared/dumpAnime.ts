/**
 * Parsers puros del dump `anime-offline-database` (JSONL, una entry por línea).
 *
 * El dump es el seed **disperso por diseño**: trae ids y base (título, tipo,
 * estado, temporada, sinónimos) pero no sinopsis, stats MAL ni relations
 * tipadas. Los vocabularios se normalizan a los de Jikan para que el diff de
 * promoción no vea cambios fantasma cuando Jikan enriquezca estas filas.
 */
export interface DumpEntry {
  sources?: string[]
  title?: string
  type?: string
  episodes?: number | null
  status?: string
  animeSeason?: { season?: string; year?: number } | null
  synonyms?: string[]
}

export interface ParsedDumpAnime {
  malId: number
  anilistId: number | null
  kitsuId: number | null
  title: string
  type: string | null
  status: string | null
  episodes: number | null
  year: number | null
  season: string | null
  synonyms: string[]
}

const idFromSources = (
  sources: string[] | undefined,
  host: string
): number | null => {
  const found = sources?.find((s) => s.includes(host))
  const match = found?.match(/\/anime\/(\d+)/)
  return match ? Number(match[1]) : null
}

const TYPE_MAP: Record<string, string> = {
  TV: 'TV',
  MOVIE: 'Movie',
  OVA: 'OVA',
  SPECIAL: 'Special',
  ONA: 'ONA',
  MUSIC: 'Music',
}

const STATUS_MAP: Record<string, string> = {
  FINISHED: 'Finished Airing',
  ONGOING: 'Currently Airing',
  UPCOMING: 'Not yet aired',
}

const SEASON_MAP: Record<string, string> = {
  SPRING: 'spring',
  SUMMER: 'summer',
  FALL: 'fall',
  WINTER: 'winter',
}

/**
 * Devuelve la fila lista para `anime` + `anime_external_ids`, o `null` si la
 * entry no trae `mal_id` (sin clave no hay fila posible).
 */
export function parseDumpEntry(entry: DumpEntry): ParsedDumpAnime | null {
  const malId = idFromSources(entry.sources, 'myanimelist.net')
  if (!malId || !entry.title) return null

  const synonyms = [...new Set(entry.synonyms ?? [])].filter(
    (s) => typeof s === 'string' && s.length > 0 && s !== entry.title
  )

  return {
    malId,
    anilistId: idFromSources(entry.sources, 'anilist.co'),
    kitsuId: idFromSources(entry.sources, 'kitsu.app'),
    title: entry.title,
    type: (entry.type && TYPE_MAP[entry.type]) ?? null,
    status: (entry.status && STATUS_MAP[entry.status]) ?? null,
    episodes:
      typeof entry.episodes === 'number' && entry.episodes > 0
        ? entry.episodes
        : null,
    year: entry.animeSeason?.year ?? null,
    season:
      (entry.animeSeason?.season && SEASON_MAP[entry.animeSeason.season]) ??
      null,
    synonyms,
  }
}
