import { CONFIG } from '../config/config.js'
import { fetcher } from './fetcher.js'

let cachedToken: string | null = null
let tokenExpiresAt = 0

export async function authenticate(): Promise<string> {
  // TVDB tokens last ~24h; refresh after 20h to be safe
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken
  }

  const response = await fetcher<{ data: { token: string } }>({
    url: `${CONFIG.TVDB_BASE}/login`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apikey: CONFIG.TVDB_API_KEY,
    }),
  })

  cachedToken = response.data.token
  tokenExpiresAt = Date.now() + 20 * 60 * 60 * 1000 // 20 hours
  return cachedToken
}
