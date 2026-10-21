import { sql } from 'drizzle-orm'
import { episode } from './../schemas/episode.js'
import type {
  EpisodeProcessorResult,
  NewEpisode,
  NewMedia,
} from '../types/index.js'
import { db } from '../libs/db.js'
import { mediaRepository } from './media.js'
import { chunk, MAX_PARAMS_PER_STATEMENT } from '../utils/chunk.js'
import { unique } from '../utils/deduplicate.js'

/** Par (anime, número) → id surrogate del episodio en la DB. */
const resolveEpisodeIds = async (
  pairs: { animeId: number; number: number }[]
): Promise<Map<string, number>> => {
  const ids = new Map<string, number>()
  const perChunk = Math.floor(MAX_PARAMS_PER_STATEMENT / 2)
  for (const batch of chunk(pairs, perChunk)) {
    const tuples = sql.join(
      batch.map((p) => sql`(${p.animeId}, ${p.number})`),
      sql`, `
    )
    const rows = await db.execute(sql`
      SELECT id, anime_id, number FROM episode
      WHERE (anime_id, number) IN (${tuples})
    `)
    for (const row of rows.rows as unknown as {
      id: number
      anime_id: number
      number: number
    }[]) {
      ids.set(`${row.anime_id}:${row.number}`, row.id)
    }
  }
  return ids
}

export const animeEpisodesRepository = {
  async upsertAnimeEpisodesBatch(
    episodeEntries: NewEpisode[]
  ): Promise<number> {
    try {
      // episode table has ~10 columns, use conservative batch size
      const batchSize = Math.floor(MAX_PARAMS_PER_STATEMENT / 10)
      const chunks = chunk(episodeEntries, batchSize)
      await db.transaction(async (tx) => {
        for (const batch of chunks) {
          await tx.insert(episode).values(batch).onConflictDoNothing()
        }
      })
      return episodeEntries.length
    } catch (e) {
      // Re-lanzar para que el manager marque la tarea `failed` y no
      // `completed`: devolver 0 en silencio equivale a perder episodios.
      console.error('Failed to upsert anime episodes batch:', e)
      throw e
    }
  },

  /**
   * Guarda las miniaturas: primero se asegura el episodio (por si el lote de
   * episodios viene vacío) y después se resuelve su `id` para escribir
   * `episode_media` con `media_type = 'thumbnail'`.
   */
  async saveEpisodeMedia(
    episodeMedia: { animeId: number; number: number; src: string }[]
  ): Promise<number> {
    const items = unique(
      episodeMedia,
      (m) => `${m.animeId}:${m.number}:${m.src}`
    )
    if (items.length === 0) return 0

    const ids = await resolveEpisodeIds(items)
    const media: NewMedia[] = items
      .map((item) => {
        const episodeId = ids.get(`${item.animeId}:${item.number}`)
        if (!episodeId) return null
        return {
          entityType: 'episode' as const,
          entityId: episodeId,
          mediaType: 'thumbnail',
          src: item.src,
          size: null,
        }
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)

    return await mediaRepository.saveMedia(media, 'kitsu')
  },

  async saveAnimeEpisodes(
    animeEpisodeResults: EpisodeProcessorResult[]
  ): Promise<number> {
    const episodes: NewEpisode[] = []
    const episodeMedia: { animeId: number; number: number; src: string }[] = []
    for (const result of animeEpisodeResults) {
      episodes.push(...result.episodes)
      if (result.episodeMedia) episodeMedia.push(...result.episodeMedia)
    }
    const saved = await this.upsertAnimeEpisodesBatch(episodes)
    // Las miniaturas dependen del `id` del episodio, que ya existe tras el
    // upsert; si algo falla aquí, la tarea se marca `failed` y se reintenta.
    const mediaSaved = await this.saveEpisodeMedia(episodeMedia)
    return saved + mediaSaved
  },
}
