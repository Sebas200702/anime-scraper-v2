/**
 * Next.js sirve sus datos en `/_next/data/{buildId}/…` y el `buildId` **cambia
 * en cada deploy** del sitio (H-14: rompió el source de AnimeThemes con 404 en
 * masa). Se resuelve del HTML del sitio y se cachea con TTL; si un endpoint
 * devuelve 404 se puede invalidar y re-resolver (deploy a mitad de corrida).
 */
import { FetchError } from './httpError.js'
import { fetcher } from './fetcher.js'
import type { ProxyTarget } from './transport.js'

const TTL_MS = 30 * 60 * 1000

let cache: { base: string; buildId: string; at: number } | null = null

export const invalidateNextBuildId = (): void => {
  cache = null
}

const extractBuildId = (html: string): string | null => {
  const match = /"buildId"\s*:\s*"([^"]+)"/.exec(html)
  return match?.[1] ?? null
}

export const resolveNextBuildId = async (
  siteBase: string,
  proxy?: ProxyTarget,
  override?: string
): Promise<string> => {
  if (override) return override

  if (cache && cache.base === siteBase && Date.now() - cache.at < TTL_MS) {
    return cache.buildId
  }

  const html = await fetcher<string>({
    url: siteBase,
    isJson: false,
    agent: proxy,
    retry: { maxAttempts: 2 },
  })

  const buildId = extractBuildId(String(html))
  if (!buildId) {
    throw new Error(
      `No se pudo resolver el buildId de ${siteBase} (¿cambió el formato?)`
    )
  }

  cache = { base: siteBase, buildId, at: Date.now() }
  return buildId
}

/**
 * Trae `path` desde `/_next/data/{buildId}{path}`. Si el 404 viene de un deploy
 * entre la resolución y la petición, re-resuelve y reintenta una vez.
 */
export const fetchNextData = async <T>(
  getBase: () => string,
  path: string,
  proxy?: ProxyTarget,
  override?: string
): Promise<T> => {
  const base = getBase()
  const buildId = await resolveNextBuildId(base, proxy, override)
  const url = `${base}/_next/data/${buildId}${path}`

  try {
    return await fetcher<T>({ url, agent: proxy })
  } catch (error) {
    if (!(error instanceof FetchError) || error.kind !== 'not_found')
      throw error

    invalidateNextBuildId()
    const fresh = await resolveNextBuildId(base, proxy, override)
    if (fresh === buildId) throw error

    return await fetcher<T>({
      url: `${base}/_next/data/${fresh}${path}`,
      agent: proxy,
    })
  }
}
