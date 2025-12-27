import { episode } from './../schemas/episode.js'
import type { EpisodeProcessorResult, NewEpisode } from '../types/index.js'
import { db } from '../libs/db.js'

export const animeEpisodesRepository = {
  async upsertAnimeEpisodesBatch(
    episodeEntries: NewEpisode[]
  ): Promise<number> {
    try {
      await db.insert(episode).values(episodeEntries).onConflictDoNothing()
      return episodeEntries.length
    } catch (e) {
      console.error('Failed to upsert anime episodes batch:', e)
      return 0
    }
  },

  async saveAnimeEpisodes(
    animeEpisodeResults: EpisodeProcessorResult[]
  ): Promise<void> {
    const episodes: NewEpisode[] = []
    for (const result of animeEpisodeResults) {
      episodes.push(...result.episodes)
    }
    await this.upsertAnimeEpisodesBatch(episodes)
  },
}
