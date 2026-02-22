import { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import { anime, animeTitleSynonym } from '../schemas/anime.js'
import { producer, producerTitle } from '../schemas/producer.js'
import { character, characterNickname } from '../schemas/character.js'
import { staff, staffAlternativeName } from '../schemas/staff.js'
import { artist } from '../schemas/artist.js'
import { music, musicResolution, musicVersion } from '../schemas/music.js'
import { episode, episodeSource, episodeSubtitle } from '../schemas/episode.js'
import { scrapingTasks } from '../schemas/scrapingTasks.js'
import { genre, demographic, theme } from '../schemas/animeTaxonomy.js'
import { characterVoiceActor } from '../schemas/characterRelations.js'
import { musicArtist } from '../schemas/musicRelations.js'
import { media } from '../schemas/media.js'
import {
  animeGenre,
  animeDemographic,
  animeTheme,
  animeStaff,
  animeMusic,
  animeCharacter,
  animeRelatedAnime,
  animeProducer,
} from '../schemas/animeRelations.js'
import { animeExternalIds } from '../schemas/animeExternal.js'

export type Anime = InferSelectModel<typeof anime>
export type NewAnime = InferInsertModel<typeof anime>
export type AnimeTitleSynonym = InferSelectModel<typeof animeTitleSynonym>
export type NewAnimeTitleSynonym = InferInsertModel<typeof animeTitleSynonym>
export type Producer = InferSelectModel<typeof producer>
export type NewProducer = InferInsertModel<typeof producer>
export type ProducerTitle = InferSelectModel<typeof producerTitle>
export type NewProducerTitle = InferInsertModel<typeof producerTitle>
export type Character = InferSelectModel<typeof character>
export type NewCharacter = InferInsertModel<typeof character>
export type CharacterNickname = InferSelectModel<typeof characterNickname>
export type NewCharacterNickname = InferInsertModel<typeof characterNickname>
export type Staff = InferSelectModel<typeof staff>
export type NewStaff = InferInsertModel<typeof staff>
export type StaffAlternativeName = InferSelectModel<typeof staffAlternativeName>
export type NewStaffAlternativeName = InferInsertModel<
  typeof staffAlternativeName
>
export type Artist = InferSelectModel<typeof artist>
export type NewArtist = InferInsertModel<typeof artist>
export type Music = InferSelectModel<typeof music>
export type NewMusic = InferInsertModel<typeof music>
export type MusicResolution = InferSelectModel<typeof musicResolution>
export type NewMusicResolution = InferInsertModel<typeof musicResolution>
export type MusicVersion = InferSelectModel<typeof musicVersion>
export type NewMusicVersion = InferInsertModel<typeof musicVersion>
export type Episode = InferSelectModel<typeof episode>
export type NewEpisode = InferInsertModel<typeof episode>
export type EpisodeSource = InferSelectModel<typeof episodeSource>
export type NewEpisodeSource = InferInsertModel<typeof episodeSource>
export type EpisodeSubtitle = InferSelectModel<typeof episodeSubtitle>
export type NewEpisodeSubtitle = InferInsertModel<typeof episodeSubtitle>
export type BbScrapingTask = InferSelectModel<typeof scrapingTasks>
export type NewBbScrapingTask = InferInsertModel<typeof scrapingTasks>
export type Genre = InferSelectModel<typeof genre>
export type NewGenre = InferInsertModel<typeof genre>
export type Demographic = InferSelectModel<typeof demographic>
export type NewDemographic = InferInsertModel<typeof demographic>
export type Theme = InferSelectModel<typeof theme>
export type NewTheme = InferInsertModel<typeof theme>
export type CharacterVoiceActor = InferSelectModel<typeof characterVoiceActor>
export type NewCharacterVoiceActor = InferInsertModel<
  typeof characterVoiceActor
>
export type MusicArtist = InferSelectModel<typeof musicArtist>
export type NewMusicArtist = InferInsertModel<typeof musicArtist>
export type AnimeGenre = InferSelectModel<typeof animeGenre>
export type NewAnimeGenre = InferInsertModel<typeof animeGenre>
export type AnimeDemographic = InferSelectModel<typeof animeDemographic>
export type NewAnimeDemographic = InferInsertModel<typeof animeDemographic>
export type AnimeTheme = InferSelectModel<typeof animeTheme>
export type NewAnimeTheme = InferInsertModel<typeof animeTheme>
export type AnimeStaff = InferSelectModel<typeof animeStaff>
export type NewAnimeStaff = InferInsertModel<typeof animeStaff>
export type AnimeMusic = InferSelectModel<typeof animeMusic>
export type NewAnimeMusic = InferInsertModel<typeof animeMusic>
export type AnimeCharacter = InferSelectModel<typeof animeCharacter>
export type NewAnimeCharacter = InferInsertModel<typeof animeCharacter>
export type AnimeExternalIds = InferSelectModel<typeof animeExternalIds>
export type NewAnimeExternalIds = InferInsertModel<typeof animeExternalIds>
export type AnimeRelatedAnime = InferSelectModel<typeof animeRelatedAnime>
export type NewAnimeRelatedAnime = InferInsertModel<typeof animeRelatedAnime>
export type AnimeProducer = InferSelectModel<typeof animeProducer>
export type NewAnimeProducer = InferInsertModel<typeof animeProducer>
export type Media = InferSelectModel<typeof media>
export type NewMedia = InferInsertModel<typeof media>
export interface SourceConfig {
  name: string
  maxWorkers: number
  /** Number of concurrent tasks per worker thread (default: 1) */
  concurrencyPerWorker?: number
  /** Max tasks to load per batch iteration (default: 2000) */
  taskBatchSize?: number
  pageBatch: number
  rateLimit: { perSecond?: number; perMinute: number }
  deduplicateBy?: string | null
  tasks: {
    [key: string]: {
      entity: string
      useEntityIdDirectly?: boolean
      needsPayload?: boolean
      extractPage?: boolean
    }
  }
}
export interface BufferedTask {
  taskId: number
  taskType: string
  data: any
}

export interface ScrapingTask {
  id: number
  taskType: string
  entityId: string
  entityType: string
  priority: number
  status: string
  attempts: number
  error: string | null
  payload: Record<string, any> | null
  scheduledAt: Date | null
  createdAt: Date
  updatedAt: Date
}
export interface NewScrapingTask {
  id?: number
  taskType: string
  entityId: string
  entityType: string
  priority: number
  status: string
  attempts?: number
  error?: string | null
  payload?: Record<string, any> | null
  scheduledAt?: Date
  createdAt?: Date
  updatedAt?: Date
}

export interface ProxyState {
  url: string
  failures: number
  lastUsed: number
  cooldownUntil: number
  totalRequests: number
}
export interface WorkerData {
  workerId: number
  tasks: ScrapingTask[]
  /** Array of proxy URL strings for this worker to rotate through */
  proxyUrls: string[]
  sourceName: string | undefined
  sourceConfig: SourceConfig | null
}

export interface WorkerMessage {
  workerId: number
  status: 'done' | 'error' | 'finished' | 'proxy-failure' | 'proxy-success'
  taskType: string
  entity?: string
  taskId: number
  error?: string
  data?: any
  proxyUrl?: string
}

export interface AnimeProcessorResult {
  anime: NewAnime
  titleSynonyms: NewAnimeTitleSynonym[]
  genres: NewGenre[]
  demographics: NewDemographic[]
  themes: NewTheme[]
  animeMedias: NewMedia[]
}

export interface CharacterProcessorResult {
  character: NewCharacter
  nicknames: NewCharacterNickname[]
  characterMedia: NewMedia[]
}
export interface StaffProcessorResult {
  staff: NewStaff
  alternativeNames: NewStaffAlternativeName[]
}
export interface ProducerProcessorResult {
  producer: NewProducer
  producerMedia: NewMedia[]
  titles: NewProducerTitle[]
}

export interface AnimeRelationsProcessorResult {
  animeGenres: NewAnimeGenre[]
  animeDemographics: NewAnimeDemographic[]
  animeThemes: NewAnimeTheme[]
  animeRelatedAnime: NewAnimeRelatedAnime[]
  animeProducers: NewAnimeProducer[]
}

export interface AnimeCharactersProcessorResult {
  animeCharacters: NewAnimeCharacter[]
  characterVoiceActors: NewCharacterVoiceActor[]
}

export interface AnimeStaffProcessorResult {
  animeStaffs: NewAnimeStaff[]
  staffMedia: NewMedia[]
}

export interface ArtworksProcessorResult {
  artworks: NewMedia[]
}

export interface AnimeMusicProcessorResult {
  musics: NewMusic[]
  musicResolutions: NewMusicResolution[]
  musicVersions: NewMusicVersion[]
  animeMusics: NewAnimeMusic[]
  musicArtists: { musicId: number; artistName: string }[]
}

export interface AnimeArtistProcessorResult {
  artist: NewArtist
  artistMedias: {
    entityType: string
    artistName: string
    mediaType: string
    src: string
    id?: number | undefined
    size?: string | null | undefined
  }[]
}

export interface AnimeExternalIdsProcessorResult {
  animeExternalIds: NewAnimeExternalIds
}

export interface EpisodeProcessorResult {
  episodes: NewEpisode[]
}
