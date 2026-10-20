/**
 * Harvest y verificación de proxies libres, en dos etapas.
 *
 * 1) Descarga listados públicos (repos que se auto-verifican) y los mezcla con
 *    `proxies.json` si existe (o con `--from <archivo>`).
 * 2) Etapa 1 — liveness + IP de egreso: pide `https://api.ipify.org` a través
 *    de cada proxy. Si la IP no cambia, el proxy es transparente y se descarta
 *    (no sirve para repartir carga entre IPs).
 * 3) Etapa 2 — solo supervivientes: una request real a Jikan v4.
 * 4) Escribe `proxies.verified.json` (mismo formato que `proxies.json`) y un
 *    resumen con latencias y fallos clasificados por `FetchError.kind`.
 *
 * Uso:
 *   bun run proxies:probe --limit 200 --concurrency 25
 *   bun run proxies:probe --from ./mis-proxies.txt --stage1-only
 *   bun run proxies:probe --no-lists --limit 100
 *
 * Seguridad: las listas públicas son de operadores desconocidos. Úsalas solo
 * contra fuentes sin credenciales (Jikan, Kitsu, AnimeThemes): nunca mandes el
 * token de TVDB por un proxy libre, y valida el payload antes de escribirlo al
 * catálogo (un proxy puede inyectar datos).
 */
import { readFile, writeFile } from 'node:fs/promises'
import { CONFIG } from '../config/config.js'
import { FetchError, fetcher } from '../libs/fetcher.js'
import { parseProxyEntries, parseProxyList } from '../libs/proxyCandidates.js'
import { normalizeProxy } from '../libs/transport.js'

const SOURCES = [
  // Verificadas a mano el 2026-10-15 (todas responden 200 y listan ip:port).
  'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
  'https://raw.githubusercontent.com/xyzs996/free-proxy-health-list/main/http.txt',
  'https://raw.githubusercontent.com/Thordata/awesome-free-proxy-list/main/proxies/all.txt',
  'https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/http.txt',
  'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt',
  // Verificadas el 2026-10-20 (todas responden 200 y listan ip:port).
  'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt',
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
  'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&protocol=http&proxy_format=ipport&format=text',
  'https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/http.txt',
  'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
]

const IP_CHECK_URL = 'https://api.ipify.org?format=json'
const DEFAULT_CHECK_URL = 'https://api.jikan.moe/v4/anime/1'

const args = process.argv.slice(2)
const flag = (name: string, fallback: string): string => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback
}
const has = (name: string): boolean => args.includes(`--${name}`)

const limit = Number(flag('limit', '150'))
const concurrency = Number(flag('concurrency', '20'))
const timeoutMs = Number(flag('timeout', '8000'))
const outFile = flag('out', 'proxies.verified.json')
const fromFile = flag('from', '')
const onlyFile = flag('only', '')
const checkUrl = flag('check-url', DEFAULT_CHECK_URL)
const stage1Only = has('stage1-only')

interface ProbeOk {
  entry: string
  ok: true
  ms: number
  detail: string
}

interface ProbeFail {
  entry: string
  ok: false
  ms: number
  kind: string
  detail: string
}

type Probe = ProbeOk | ProbeFail

const credentials = { user: CONFIG.PROXY_USER, pass: CONFIG.PROXY_PASS }

const mapWithConcurrency = async <T, R>(
  items: T[],
  max: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const results: R[] = new Array(items.length)
  let next = 0

  const runners = Array.from(
    { length: Math.max(1, Math.min(max, items.length)) },
    async () => {
      while (next < items.length) {
        const index = next++
        const item = items[index]
        if (item !== undefined) results[index] = await fn(item, index)
      }
    }
  )

  await Promise.all(runners)
  return results
}

const toProbe = (
  entry: string,
  started: number,
  error: unknown,
  detail: string
): ProbeFail => ({
  entry,
  ok: false,
  ms: Date.now() - started,
  kind: error instanceof FetchError ? error.kind : 'unknown',
  detail: detail || String((error as Error)?.message ?? '').slice(0, 70),
})

const proxyFor = (entry: string): string | undefined =>
  normalizeProxy(entry, credentials) ?? undefined

const probeEgress = async (entry: string): Promise<Probe> => {
  const started = Date.now()
  try {
    const data = await fetcher<{ ip?: string }>({
      url: IP_CHECK_URL,
      agent: proxyFor(entry),
      timeoutMs,
      retry: { maxAttempts: 1 },
    })
    return {
      entry,
      ok: true,
      ms: Date.now() - started,
      detail: data.ip ?? 'sin ip',
    }
  } catch (error) {
    return toProbe(entry, started, error, '')
  }
}

const probeTarget = async (entry: string): Promise<Probe> => {
  const started = Date.now()
  try {
    const data = await fetcher<unknown>({
      url: checkUrl,
      agent: proxyFor(entry),
      timeoutMs: timeoutMs + 4000,
      retry: { maxAttempts: 1 },
    })

    const detail = describePayload(data)
    if (!detail) {
      return {
        entry,
        ok: false,
        ms: Date.now() - started,
        kind: 'invalid_body',
        detail: `json vacío: ${JSON.stringify(data)?.slice(0, 40)}`,
      }
    }
    return { entry, ok: true, ms: Date.now() - started, detail }
  } catch (error) {
    return toProbe(entry, started, error, '')
  }
}

/**
 * Describe un payload JSON válido sin depender de la forma de una API concreta
 * (Jikan usa `data.title`, Kitsu `data.attributes.canonicalTitle`, ipify
 * `ip`…). Devuelve `null` si el JSON está vacío.
 */
const describePayload = (data: unknown): string | null => {
  const serialized = JSON.stringify(data)
  if (
    !serialized ||
    serialized === '{}' ||
    serialized === '[]' ||
    serialized === 'null'
  ) {
    return null
  }

  const pick = (path: string): unknown =>
    path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') {
        return (acc as Record<string, unknown>)[key]
      }
      return undefined
    }, data)

  for (const path of [
    'data.title',
    'data.attributes.canonicalTitle',
    'title',
    'name',
    'ip',
  ]) {
    const value = pick(path)
    if (typeof value === 'string' || typeof value === 'number') {
      return `${path}=${value}`
    }
  }

  return `json:${serialized.slice(0, 40)}`
}

const histogram = (probes: Probe[]): string => {
  const counts = new Map<string, number>()
  for (const probe of probes) {
    if (probe.ok) continue
    counts.set(probe.kind, (counts.get(probe.kind) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => `${kind}=${count}`)
    .join(' ')
}

const fetchList = async (url: string): Promise<string[]> => {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.warn(`   ${url} → HTTP ${response.status}`)
      return []
    }
    return parseProxyList(await response.text())
  } catch (error) {
    console.warn(`   ${url} → ${String((error as Error).message).slice(0, 60)}`)
    return []
  }
}

// --- 1. Candidatos ---------------------------------------------------------

const perSource: string[][] = []

const addFile = async (path: string, label: string) => {
  try {
    const raw = await readFile(path, 'utf8')
    const found = parseProxyEntries(raw)
    console.log(`   ${label} → ${found.length}`)
    perSource.push(found)
  } catch {
    console.warn(`   ${label} → no se pudo leer`)
  }
}

if (onlyFile) {
  // Modo exclusivo: mide exactamente esta lista (sin listas públicas ni
  // proxies.json), que es lo que se quiere al verificar un proveedor.
  await addFile(onlyFile, onlyFile)
} else {
  for (const entry of SOURCES) {
    if (has('no-lists')) break
    const found = await fetchList(entry)
    console.log(`   ${entry.split('/').slice(-1)[0]} → ${found.length}`)
    perSource.push(found)
  }

  if (fromFile) await addFile(fromFile, fromFile)
  if (!has('no-local')) await addFile('./proxies.json', 'proxies.json')
}

// Round-robin entre listas: si se tomara el prefijo del union, se mediría solo
// la primera fuente (sesgo que ya nos mordió una vez).
const interleaved: string[] = []
const seen = new Set<string>()
for (let index = 0; ; index++) {
  let added = false
  for (const list of perSource) {
    const entry = list[index]
    if (entry === undefined) continue
    added = true
    if (seen.has(entry)) continue
    seen.add(entry)
    interleaved.push(entry)
  }
  if (!added) break
}

const sample = interleaved.slice(0, limit)
console.log(`\ncandidatos: ${interleaved.length} (probando ${sample.length})\n`)

// --- 2. Etapa 1: IP de egreso ---------------------------------------------

let localIp: string | null = null
try {
  const control = await fetch(IP_CHECK_URL)
  localIp = ((await control.json()) as { ip?: string }).ip ?? null
  console.log(`IP local (control): ${localIp}`)
} catch {
  console.log(
    'IP local: no se pudo medir (sigue: los transparentes se ven por ip igual)'
  )
}

console.log(`\netapa 1 — liveness + egreso (concurrency ${concurrency})`)
const stage1 = await mapWithConcurrency(sample, concurrency, probeEgress)

const transparent = stage1.filter(
  (probe) => probe.ok && localIp !== null && probe.detail === localIp
)
const alive = stage1.filter(
  (probe) => probe.ok && !(localIp !== null && probe.detail === localIp)
)

console.log(
  `vivos: ${alive.length} · transparentes: ${transparent.length} · fallos: ${histogram(stage1)}`
)

// --- 3. Etapa 2: Jikan ----------------------------------------------------

let finalists: ProbeOk[] = alive as ProbeOk[]

if (!stage1Only && alive.length > 0) {
  // Control: si el objetivo no es alcanzable ni directo, el veredicto de la
  // etapa 2 no dice nada sobre los proxies.
  try {
    await fetcher({
      url: checkUrl,
      timeoutMs: timeoutMs + 4000,
      retry: { maxAttempts: 1 },
    })
    console.log(`\ncontrol directo a ${checkUrl}: OK`)
  } catch (error) {
    const kind = error instanceof FetchError ? error.kind : 'unknown'
    console.log(
      `\n⚠️  control directo a ${checkUrl} falló (${kind}): la etapa 2 NO es concluyente. Repite desde una red que alcance el objetivo (o usa --check-url).`
    )
  }

  console.log(`\netapa 2 — ${checkUrl} (${alive.length} candidatos)`)
  const stage2 = await mapWithConcurrency(
    alive,
    Math.min(concurrency, 10),
    (probe) => probeTarget(probe.entry)
  )
  finalists = stage2.filter((probe): probe is ProbeOk => probe.ok)
  console.log(
    `pasan la verificación: ${finalists.length} · fallos: ${histogram(stage2)}`
  )
  for (const failure of stage2.filter((probe) => !probe.ok).slice(0, 5)) {
    console.log(`   ✗ ${failure.entry} → ${failure.kind}: ${failure.detail}`)
  }
}

// --- 4. Resultado ---------------------------------------------------------

finalists.sort((a, b) => a.ms - b.ms)

console.log('\nmejores (latencia → título):')
for (const probe of finalists.slice(0, 15)) {
  console.log(
    `   ${probe.ms.toString().padStart(5)}ms  ${probe.entry}  ${probe.detail}`
  )
}

await writeFile(
  outFile,
  `${JSON.stringify(
    finalists.map((probe) => probe.entry),
    null,
    2
  )}\n`
)

console.log(
  `\n✓ ${finalists.length} proxies escritos en ${outFile}` +
    (credentials.user
      ? ' (sin credenciales: se inyectan desde PROXY_USER/PROXY_PASS)'
      : '')
)
console.log(
  'Recuerda: son proxies públicos de operadores desconocidos; úsalos solo para fuentes sin credenciales y valida el payload.'
)
