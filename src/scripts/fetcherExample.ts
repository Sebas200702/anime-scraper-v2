import { fetcher } from '../libs/fetcher.js'
import { ProxyAgent } from 'undici'

const proxies = [
  '65.111.27.56:3129',
  '216.26.231.240:3129',
  '65.111.28.82:3129',
  '65.111.12.128:3129',
  '216.26.236.41:3129',
  '209.50.160.225:3129',
  '209.50.164.209:3129',
  '45.3.49.40:3129',
]

for (const proxy of proxies) {
  try {
    const response = await fetcher({
      url: 'https://api.jikan.moe/v4/anime/1',
      method: 'GET',
      agent: new ProxyAgent(`http://${proxy}`),
    })
    console.log(`Success with proxy ${proxy}:`, response)
  } catch (e) {
    console.error(`Failed to fetch with proxy ${proxy}:`, e)
  }
}
