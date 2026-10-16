import { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import { anime, animeTitleSynonym } from '../schemas/anime.js'
import { producer, producerTitle } from '../schemas/producer.js'
import { character, characterNickname } from '../schemas/character.js'
import { staff, staffAlternativeName } from '../schemas/staff.js'
import { artist } from '../schemas/artist.js'
import { music, musicResolution, musicVersion } from '../schemas/music.js'
import { episode, episodeSource, episodeSubtitle } from '../schemas/episode.js'
import { ingestTask } from '../schemas/ingest.js'
import { genre, demographic, theme } from '../schemas/animeTaxonomy.js'
import { characterVoiceActor } from '../schemas/characterRelations.js'
import { musicArtist } from '../schemas/musicRelations.js'
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
export type BbScrapingTask = InferSelectModel<typeof ingestTask>
export type NewBbScrapingTask = InferInsertModel<typeof ingestTask>
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
/**
 * Media en el catálogo de anidev, que la normaliza **por entidad** (una tabla
 * por tipo): `entityType` decide a qué tabla enruta `mediaRepository.saveMedia`.
 */
export interface Media {
  id: number
  entityType:
    | 'anime'
    | 'character'
    | 'staff'
    | 'producer'
    | 'episode'
    | 'music'
    /** Sin tabla en el DDL de anidev: el router lo avisa y lo descarta. */
    | 'artist'
  entityId: number
  mediaType: string
  src: string
  size: string | null
  /** Origen del asset (`anilist`, `tvdb`, `jikan`…). */
  source: string | null
  /** Menor = se prefiere al elegir una variante del mismo `mediaType`. */
  priority: number
}
export type NewMedia = Omit<Media, 'id' | 'source' | 'priority'> & {
  id?: number
  source?: string | null
  priority?: number
}
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
export type ProcessorResult =
  | AnimeProcessorResult
  | CharacterProcessorResult
  | StaffProcessorResult
  | ProducerProcessorResult
  | AnimeRelationsProcessorResult
  | AnimeCharactersProcessorResult
  | AnimeStaffProcessorResult
  | ArtworksProcessorResult
  | AnimeMusicProcessorResult
  | AnimeArtistProcessorResult
  | AnimeExternalIdsProcessorResult
  | EpisodeProcessorResult

export interface BufferedTask {
  taskId: number
  taskType: string
  data: ProcessorResult | ProcessorResult[]
}

export interface SourceRepository {
  [key: `save${string}`]: (
    items: ProcessorResult[]
  ) => Promise<number | undefined>
}

/** Tarea de la cola `ingest.task` (una fila por unidad de trabajo). */
export type ScrapingTask = InferSelectModel<typeof ingestTask>
export type NewScrapingTask = InferInsertModel<typeof ingestTask>

export interface ProxyState {
  url: string
  failures: number
  lastUsed: number
  cooldownUntil: number
  totalRequests: number
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

/** Resultado del processor de banners (AniList). */
export interface AnimeBannersProcessorResult {
  animeMedias: NewMedia[]
  /**
   * Parche disperso para la fila `anime`: solo trae las columnas que AniList
   * conoce (tráiler, origen, fechas de emisión). Lo ausente se omite, nunca
   * se escribe como null.
   */
  animePatch?: AnimePatch
  /** Relations tipadas hacia otros anime (solo nodos ANIME con idMal). */
  animeRelations?: NewAnimeRelatedAnime[]
}

/**
 * Subconjunto escribible de `anime` desde AniList. `malId` es la clave;
 * el resto son opcionales y el repositorio solo actualiza los presentes.
 */
export interface AnimePatch {
  malId: number
  trailerYoutubeId?: string
  trailerEmbedUrl?: string
  source?: string
  /** Fecha ISO `YYYY-MM-DD` (el repo la convierte a timestamptz). */
  airedFrom?: string
  airedTo?: string
  /** Sinopsis en texto plano (el processor pela el HTML de AniList). */
  synopsis?: string
  /** Día de emisión estilo Jikan ("Mondays") derivado del próximo episodio. */
  broadcastDay?: string
  broadcastTime?: string
  broadcastTimezone?: string
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
