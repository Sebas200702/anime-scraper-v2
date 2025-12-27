import { CONFIG } from '../config/config.js'
import { fetcher } from './fetcher.js'

export async function authenticate() {
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

  return response.data.token
}
