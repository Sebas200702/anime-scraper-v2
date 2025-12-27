import { ProxyAgent, request } from 'undici'

interface FetcherOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  agent?: ProxyAgent
  options?: Record<string, any>
  body?: any
}
export const fetcher = async <T>({
  url,
  method = 'GET',
  headers = {},
  agent,
  body,
}: FetcherOptions) => {
  const defaultHeaders: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Connection: 'keep-alive',
  }
  const mergedHeaders = { ...defaultHeaders, ...headers }

  const fetchOptions = {
    method,
    headers: mergedHeaders,
    body,
    ...(agent ? { dispatcher: agent } : {}),
  }
  const { body: responseBody, statusCode } = await request(url, fetchOptions)

  if (statusCode >= 400) {
    throw new Error(`Api returned ${statusCode}`)
  }
  const text = await responseBody.text()
  const data = JSON.parse(text)

  return data as T
}
