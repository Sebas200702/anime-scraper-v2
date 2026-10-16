import { describe, expect, test } from 'bun:test'
import { processAnimeMalDetails } from '../src/processors/mal.js'
import type { ScrapingTask } from '../src/types/index.js'

const task = { entityId: 'anime_mal_5114' } as unknown as ScrapingTask

describe('processAnimeMalDetails (MAL API oficial → anime + junctions con ids MAL)', () => {
  test('mapea stats/descriptivos al vocabulario Jikan y las junctions', () => {
    const result = processAnimeMalDetails(
      {
        id: 5114,
        alternative_titles: {
          en: 'Fullmetal Alchemist: Brotherhood',
          ja: '鋼の錬金術師',
        },
        start_date: '2009-04-05',
        end_date: '2010-07-04',
        synopsis: 'Two brothers...',
        mean: 9.1,
        rank: 3,
        popularity: 2,
        num_list_users: 3400000,
        num_scoring_users: 1800000,
        // MAL los mezcla: 27 (Shounen) es demográfica, 18 (Military) género.
        genres: [
          { id: 1, name: 'Action' },
          { id: 27, name: 'Shounen' },
          { id: 18, name: 'Military' },
        ],
        media_type: 'tv',
        status: 'finished_airing',
        num_episodes: 64,
        start_season: { year: 2009, season: 'spring' },
        broadcast: { day_of_the_week: 'sunday', start_time: '17:00' },
        source: 'manga',
        average_episode_duration: 1440,
        rating: 'r',
        studios: [{ id: 4, name: 'Bones' }],
      },
      task
    )

    expect(result.animeStats).toMatchObject({
      malId: 5114,
      type: 'TV',
      status: 'Finished Airing',
      episodes: 64,
      score: 9.1,
      scoredBy: 1800000,
      popularityRank: 2,
      rank: 3,
      members: 3400000,
      rating: 'R - 17+ (violence & profanity)',
      year: 2009,
      season: 'spring',
      duration: '24 min per ep',
      source: 'Manga',
      airedFrom: '2009-04-05',
      airedTo: '2010-07-04',
      broadcastDay: 'Sundays',
      broadcastTime: '17:00',
      broadcastTimezone: 'Asia/Tokyo',
    })
    expect(result.genres).toEqual([
      { malId: 1, name: 'Action' },
      { malId: 18, name: 'Military' },
    ])
    expect(result.demographics).toEqual([{ malId: 27, name: 'Shounen' }])
    expect(result.themes).toEqual([])
    expect(result.producers).toEqual([{ malId: 4 }])
    expect(result.animeProducers).toEqual([
      { animeId: 5114, producerId: 4, role: 'studio' },
    ])
    expect(result.animeGenres).toEqual([
      { animeId: 5114, genreId: 1 },
      { animeId: 5114, genreId: 18 },
    ])
    expect(result.animeDemographics).toEqual([
      { animeId: 5114, demographicId: 27 },
    ])
    expect(result.animeThemes).toEqual([])
  })

  test('sin campos opcionales no inventa valores (nunca null)', () => {
    const result = processAnimeMalDetails({ id: 1 }, task)
    expect(result.animeStats).toMatchObject({ malId: 5114 })
    expect(result.animeStats?.type).toBeUndefined()
    expect(result.animeStats?.broadcastDay).toBeUndefined()
    expect(result.genres).toEqual([])
    expect(result.animeProducers).toEqual([])
  })
})
