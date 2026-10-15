import { episode } from './../schemas/episode.js'
import type { EpisodeProcessorResult, NewEpisode } from '../types/index.js'
import { db } from '../libs/db.js'
import { chunk, MAX_PARAMS_PER_STATEMENT } from '../utils/chunk.js'

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

  async saveAnimeEpisodes(
    animeEpisodeResults: EpisodeProcessorResult[]
  ): Promise<number> {
    const episodes: NewEpisode[] = []
    for (const result of animeEpisodeResults) {
      episodes.push(...result.episodes)
    }
    return await this.upsertAnimeEpisodesBatch(episodes)
  },
}
