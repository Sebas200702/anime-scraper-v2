import type {
  MalCharactersProcessorResult,
  MalThemeRow,
  ScrapingTask,
} from '../types/index.js'
import {
  parseMalAnimePage,
  parseMalCompanies,
  parseMalFavorites,
  parseMalRelations,
} from '../shared/malAnimeHtml.js'
import type { ParsedTheme } from '../shared/malAnimeHtml.js'

/**
 * Id de pista dentro de una URL de tienda.
 *
 * - Spotify: `open.spotify.com/track/{id}`
 * - Apple Music: `music.apple.com/{country}/album/{slug}/{albumId}?i={trackId}`
 * - Amazon Music: sin id estable (solo búsqueda) → `null`.
 */
const externalIdOf = (provider: string, url: string): string | null => {
  if (provider === 'spotify')
    return url.match(/\/track\/([A-Za-z0-9]+)/)?.[1] ?? null
  if (provider === 'apple') return url.match(/[?&]i=(\d+)/)?.[1] ?? null
  return null
}

/** Storefront de la URL (`jp`, `us`) cuando lo lleva. */
const countryOf = (provider: string, url: string): string | null => {
  if (provider === 'apple')
    return url.match(/music\.apple\.com\/([a-z]{2})\//)?.[1] ?? null
  if (provider === 'amazon') {
    const host = url.match(/music\.amazon\.(co\.)?([a-z]{2})/)?.[2]
    return host ?? null
  }
  return null
}

/** Enlaces de tienda de un tema, ya normalizados por proveedor. */
export const streamsOfTheme = (
  theme: Pick<ParsedTheme, 'spotifyUrl' | 'appleUrl' | 'amazonUrl'>
): MalThemeRow['streams'] => {
  const candidates: [string, string | null][] = [
    ['spotify', theme.spotifyUrl],
    ['apple', theme.appleUrl],
    ['amazon', theme.amazonUrl],
  ]
  const out: MalThemeRow['streams'] = []
  for (const [provider, url] of candidates) {
    if (!url) continue
    out.push({
      provider,
      url,
      externalId: externalIdOf(provider, url),
      country: countryOf(provider, url),
    })
  }
  return out
}

/**
 * Convierte la ficha HTML de MAL en filas para el catálogo: character, staff,
 * las junctions, la media (retratos) y los **temas OP/ED** (música). Todo con
 * ids MAL nativos.
 */
export const processMalCharacters = (
  raw: { html: string; animeId: number },
  _task: ScrapingTask
): MalCharactersProcessorResult => {
  const { animeCharacters, animeStaff, themes } = parseMalAnimePage(raw.html)
  const animeId = raw.animeId

  const characters = animeCharacters.map((c) => ({
    malId: c.malId,
    name: c.name,
  }))
  const staff = animeStaff.map((s) => ({ malId: s.malId, name: s.name }))

  return {
    characters,
    staff,
    // Relaciones y compañías: solo en el HTML (la API da studios sin rol y
    // AniList no cubre todo el catálogo).
    animeRelations: parseMalRelations(raw.html).map((r) => ({
      animeId,
      relationType: r.type,
      relatedAnimeId: r.relatedMalId,
    })),
    animeCompanies: parseMalCompanies(raw.html).map((c) => ({
      animeId,
      producerId: c.malId,
      role: c.role,
      name: c.name,
    })),
    // La API de MAL no da los favoritos; salen de la barra lateral del HTML.
    animeFavorites: (() => {
      const favorites = parseMalFavorites(raw.html)
      return favorites === null ? [] : [{ animeId, favorites }]
    })(),
    themes: themes
      .filter((theme) => theme.malSongId !== null)
      .map((theme) => ({
        animeId,
        kind: theme.kind,
        sequence: theme.sequence,
        title: theme.title,
        artist: theme.artist,
        malSongId: theme.malSongId,
        episodes: theme.episodes,
        streams: streamsOfTheme(theme),
      })),
    animeCharacters: animeCharacters.map((c) => ({
      animeId,
      characterId: c.malId,
      role: c.role,
    })),
    animeStaff: animeStaff.flatMap((s) =>
      s.roles.map((role) => ({ animeId, staffId: s.malId, role }))
    ),
    characterVoiceActors: animeCharacters.flatMap((c) =>
      c.voiceActors.map((va) => ({
        characterId: c.malId,
        staffId: va.malId,
        language: va.language,
      }))
    ),
    // Los seiyuus también son `staff`: se garantiza su fila padre.
    voiceActorStaff: animeCharacters.flatMap((c) =>
      c.voiceActors.map((va) => ({ malId: va.malId, name: va.name }))
    ),
    characterMedia: animeCharacters
      .filter((c) => c.image)
      .map((c) => ({
        entityId: c.malId,
        src: c.image as string,
        mediaType: 'poster',
      })),
    staffMedia: animeStaff
      .filter((s) => s.image)
      .map((s) => ({
        entityId: s.malId,
        src: s.image as string,
        mediaType: 'poster',
      })),
  }
}
