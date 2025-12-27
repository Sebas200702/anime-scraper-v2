export interface AnimeThemesNextData {
  pageProps: AnimeThemesPageProps
  __N_SSG: boolean
}

export interface AnimeThemesPageProps {
  lastBuildAt: number
  apiRequests: number
  anime: AnimeThemesAnime
  synopsisMarkdownSource: AnimeThemesSynopsisMarkdownSource
}

export interface AnimeThemesAnime {
  images: AnimeThemesImage[]
  slug: string
  name: string
  season: string
  year: number
  synopsis: string
  media_format: string
  synonyms: AnimeThemesSynonym[]
  series: AnimeThemesSeriesRef[]
  studios: AnimeThemesStudioRef[]
  resources: AnimeThemesResource[]
  themes: AnimeThemesTheme[]
}

export interface AnimeThemesImage {
  link: string
  facet: string
}

export interface AnimeThemesSynonym {
  text: string
}

export interface AnimeThemesSeriesRef {
  slug: string
  name: string
}

export interface AnimeThemesStudioRef {
  slug: string
  name: string
}

export interface AnimeThemesResource {
  site: string
  link: string
  as: string | null
}

export interface AnimeThemesTheme {
  type: string
  sequence: number
  group: string | null
  id: number
  anime: AnimeThemesThemeAnimeRef
  song: AnimeThemesSong
  entries: AnimeThemesThemeEntry[]
}

export interface AnimeThemesThemeAnimeRef {
  images: AnimeThemesImage[]
  slug: string
  name: string
}

export interface AnimeThemesSong {
  title: string
  performances: AnimeThemesPerformance[]
}

export interface AnimeThemesPerformance {
  alias: string | null
  as: string | null
  artist: AnimeThemesArtistRef
}

export interface AnimeThemesArtistRef {
  slug: string
  name: string
}

export interface AnimeThemesThemeEntry {
  version: number
  id: number
  videos: AnimeThemesVideo[]
  episodes: string
  spoiler: boolean
  nsfw: boolean
}

export interface AnimeThemesVideo {
  tags: string
  id: number
  basename: string
  audio: AnimeThemesAudio
  resolution: number
  nc: boolean
  subbed: boolean
  lyrics: boolean
  uncen: boolean
  source: string
  overlap: string
  filename: string
}

export interface AnimeThemesAudio {
  basename: string
}

export interface AnimeThemesSynopsisMarkdownSource {
  compiledSource: string
  frontmatter: Record<string, unknown>
  scope: Record<string, unknown>
}

export interface AnimeThemesArtistNextData {
  pageProps: AnimeThemesArtistPageProps;
  __N_SSG: boolean;
}

export interface AnimeThemesArtistPageProps {
  lastBuildAt: number;
  apiRequests: number;
  artist: AnimeThemesArtist;
  informationMarkdownSource: AnimeThemesArtistInfoMarkdownSource | null;
}

export interface AnimeThemesArtist {
  slug: string;
  name: string;
  images: AnimeThemesArtistImage[];
  information: string | null;
  performances: AnimeThemesArtistPerformanceBlock[];
  members: unknown[];
  groups: unknown[];
  resources: AnimeThemesArtistResource[];
}

export interface AnimeThemesArtistImage {
  link: string;
  depth: number;
  facet: string;
}


export interface AnimeThemesArtistResource {
  link: string;
  site: string;
  as: string | null;
}

export interface AnimeThemesArtistPerformanceBlock {
  alias: string | null;
  as: string | null;
  song: AnimeThemesArtistSong;
}

export interface AnimeThemesArtistSong {
  id: number;
  title: string;
  performances: AnimeThemesSongPerformance[];
  themes: AnimeThemesArtistSongTheme[];
}

export interface AnimeThemesSongPerformance {
  artist: AnimeThemesArtistRef;
  alias: string | null;
  as: string | null;
}

export interface AnimeThemesArtistRef {
  slug: string;
  name: string;
}

export interface AnimeThemesArtistSongTheme {
  type: string;
  sequence: number;
  group: string | null;
  id: number;
  anime: AnimeThemesArtistThemeAnimeRef;
  song: {
    title: string;
    performances: AnimeThemesSongPerformance[];
  };
  entries: AnimeThemesArtistThemeEntry[];
}

export interface AnimeThemesArtistThemeAnimeRef {
  images: AnimeThemesArtistImage[];
  slug: string;
  name: string;
  year: number;
  season: string;
}

export interface AnimeThemesArtistThemeEntry {
  version: number;
  id: number;
  videos: AnimeThemesArtistVideo[];
  episodes: string;
  spoiler: boolean;
  nsfw: boolean;
}

export interface AnimeThemesArtistVideo {
  tags: string;
  id: number;
  basename: string;
  audio: {
    basename: string;
  };
  resolution: number;
  nc: boolean;
  subbed: boolean;
  lyrics: boolean;
  uncen: boolean;
  source: string;
  overlap: string;
}

export interface AnimeThemesArtistInfoMarkdownSource {
  compiledSource: string;
  frontmatter: Record<string, unknown>;
  scope: Record<string, unknown>;
}

export interface AnimeThemesAnimeAllFile {
  pageProps: {
    lastBuildAt: number
    apiRequests: number
    animeAll: AnimeThemesAnimeAllEntry[]
  }
}

export interface AnimeThemesAnimeAllEntry {
  slug: string // p.ej. "bocchi_the_rock"
  name: string // p.ej. "Bocchi the Rock!"
}
export interface AnimeThemesArtistAllFile {
  pageProps: {
    lastBuildAt: number
    apiRequests: number
    artistAll: AnimeThemesArtistEntry[]
  }
}

export interface AnimeThemesArtistEntry {
  slug: string
  name: string
}
