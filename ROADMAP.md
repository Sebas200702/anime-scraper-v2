# ROADMAP — anime-scraper-v2

> **Objetivo**: extraer el catálogo completo que anidev-v2 necesita y
> **mantenerlo actualizado** (Track D del `ROADMAP.md` de anidev-v2), sin
> bloqueos de fuentes y sin tareas perdidas.
>
> **Plan cruzado**: `anidev-v2/ROADMAP.md` (Track D) es la fuente de verdad de
> las decisiones de plataforma; los changes `ingest-queue-postgres` y
> `catalog-coverage-fields` en `anidev-v2/openspec/changes/` definen el DDL que
> anidev-v2 posee. Este documento es el plan de ejecución **de este repo**.
>
> **Estrategia de fill/refresh**: `docs/fill-and-refresh-strategy.md`.
>
> **Estado**: planeación cerrada 2026-10-15. **Fase 0** implementada
> (`fix/fetcher-safe-writes`) y **Fase 1 · PR1** implementado
> (`fix/fetcher-resilience`: clasificación tipada, backoff + jitter,
> `Retry-After`, timeouts separados headers/body y sniff de challenge, con
> 36 tests en `bun test` y CI en `.github/workflows/ci.yml`).
> **Hallazgo nuevo H-17**: bajo Bun los proxies **no se usan** (`ProxyAgent` es
> un stub) — PR2 queda bloqueado por la decisión de transporte.
> Falta la corrida de humo de 1.000 tareas (requiere `.env` y proxies reales).

---

## 1. Decisiones fijadas (2026-10-15)

| # | Decisión |
|---|---|
| **D-S1** | **Opción A de arquitectura**: el proceso *padre* fetchea (rate gate global por dominio + pool de proxies por request + retries), los *workers* solo mapean payload→datos (funciones puras). Un solo mecanismo de rate/retry/proxy; encaja con el claim/lease de Fase 2. |
| **D-S2** | **Modo A local**: Docker `postgres:16` (mismo tag que prod) + `bun run db:clone-prod` de anidev-v2 para sembrar el catálogo. **Modo B** escribe `ingest.*` en la Postgres de prod. Los free tiers (Neon/Supabase) no son base de nada: solo clones de ensayo de promoción o runners puntuales. |
| **D-S3** | La cola vive en **Postgres**, esquema `ingest.*`; **el DDL lo define anidev-v2** (change `ingest-queue-postgres`). Este repo no genera migraciones. |
| **D-S4** | Clave de tarea normalizada `(source, task_type, entity_id)`: una fila por unidad de trabajo que alterna `completed ⇄ due` por política de frescura. |
| **D-S5** | Tests con `bun test` + mock HTTP server local; CI (GitHub Actions) con typecheck + tests. Ningún test pega a fuentes reales. |
| **D-S6** | Fase 0 primero (mitigación config-only + 2 fixes), luego Fase 1 en 3 PRs con límite de diff. |

---

## 2. Hallazgos verificados (causa raíz)

| # | Hallazgo | Evidencia | Efecto |
|---|---|---|---|
| H-01 | Rate-limit por worker: el limiter se crea en cada thread y se llama 1×/tarea | `core/genericWorker.ts:10-13`; `config/sources.ts` (80 workers en `jikanRelations`) | Hasta 80 req/s y 3.2k/min contra Jikan (3/s, 60/min) → 429 y proxies quemados |
| H-02 | `animeMapping` tiene sus propios limiters de módulo **por worker** (4/s + 200/min) | `services/animeMapping.ts:7-8` | ~240 req/s a Kitsu (60/min) |
| H-03 | `animeEpisodes` pagina Kitsu **sin limiter entre páginas** dentro de una tarea | `services/animeEpisodes.ts:24-46` | Serie de 1000 eps = 50 requests en ráfaga desde 1 worker |
| H-04 | TVDB: token cacheado por worker y `/login` sin limiter ni proxy | `libs/tvdb.ts:4-27`; `services/mapping.ts:56` | Hasta 80 logins/run, directos desde tu IP |
| H-05 | Fetcher sin clasificación, sin retry/backoff, sin `Retry-After`, sin timeout, `JSON.parse` sin sniff | `libs/fetcher.ts:37-44` | 429/403/HTML se tratan como errores genéricos; un proxy colgado cuelga la corrida (undici default 300s) |
| H-06 | Proxies: 1 proxy por worker (sin rotación), y **nadie reporta** fallos (los handlers `proxy-failure`/`proxy-success` nunca se emiten) | `core/baseManager.ts:121-138`; `core/genericWorker.ts:8,62-72`; `core/genericManager.ts:148-155` | El pool nunca aprende; `throw 'Not enough proxies'` aborta el run; sin re-probe, el pool solo encoge |
| H-07 | Un 404 de la fuente penalizaría igual que un bloqueo (no hay distinción por causa) | mismo que H-06 | Futuro: no quemar proxies por datos que no existen |
| H-08 | Cola no crash-safe: `SELECT` plano, `in_progress` por lote adelantado, `resetStaleTasks` solo al arranque | `repositories/tasks.ts:85-90,114-118,173-188`; `core/genericManager.ts:114-116` | Worker caído = slice perdido hasta reinicio; dos instancias se roban tareas |
| H-09 | `failed` es terminal: sin retry ni dead-letter; `attempts` no gobierna nada | `repositories/tasks.ts:136-148` | Fallos transitorios se convierten en huecos permanentes |
| H-10 | `lastScrapedAt` nunca se escribe y `scheduledAt` no gatea el claim | `schemas/scrapingTasks.ts`; grep en `src/` | No existe metadata de frescura: un refresh por política es imposible hoy |
| H-11 | `batchUpsert` solo inserta (`onConflictDoNothing`) y **se traga errores**; `saveData` marca `completed` pase lo que pase | `shared/batchUpsert.ts:30,41-44`; `core/genericManager.ts:226-233` | **Pérdida silenciosa de datos**: escritura fallida = tarea completada |
| H-12 | `/full` trae studios/licensors/broadcast/trailer/rank/members/favorites/aired/duration/source y el mapper los descarta | `processors/jikanRelations.ts:20-46` vs `types/jikanDetailsApi.ts` | Huecos del catálogo (filtros de estudio/día, schedule) |
| H-13 | Los VA links filtran por FK existente y descartan en silencio | `shared/fkFilter.ts`; `repositories/jikanRelations.ts:100-111` | Explica el 4.2k/217k de links de v1; el patrón correcto ya existe en `shared/artistResolver.ts` |
| H-14 | `ANIME_THEMES_BASE` usa `_next/data/{buildId}` con buildId hardcodeado | `config/config.ts` | Rota en cada deploy de animethemes.moe → 404 masivo |
| H-15 | Cero tests, README stub, sin `.env.example`, `proxies.json` (100 proxies) commiteado, `workerPath` hardcodeado a `./dist/...` | repo | No se puede correr en local ni verificar cambios |
| H-16 | **El repo no compilaba**: `src/processors/mal/*` importa `cheerio`, que nunca estuvo en `package.json` (el path MAL es código muerto: no hay source `mal` en `SOURCES`); y `tsc` emite `dist/` igual porque no hay `noEmitOnError` | `src/processors/mal/animeDetails.ts:1`; `package.json`; `src/scripts/mal-test.ts` (único consumidor) | Build "verde" engañoso: `dist/` se genera con errores de tipo |
| H-17 | **Los proxies no se usaban en runtime**: Bun resuelve `undici` a su implementación, donde `ProxyAgent` es un stub (`class ProxyAgent extends DispatcherBase { constructor() { super(); } }`) que ignora la URL. **Matiz verificado**: el proxy nativo de Bun (`fetch(url, { proxy })`) **sí enruta** (CONNECT incluido) y Node + undici real también; solo el shim de `ProxyAgent` bajo Bun es un no-op | probes con proxies reales: Node y Bun-fetch reciben el `407` **del proxy** (prueba de ruteo), Bun+`ProxyAgent` sale directo por la IP local | Todas las requests salían por la IP local → 429 y bloqueos con 80 workers; explica por qué "el pool nunca aprende" (H-06): nunca se usó. Fase 0 (menos workers) fue la única mitigación efectiva |
| H-18 | **Los proxies de `proxies.json` exigen credenciales**: los 4 muestreados responden `407 Proxy Authentication Required` (y el archivo solo tiene `ip:port`) | probe contra `api.ipify.org` y Jikan con 4 proxies del listado | Sin `user:pass` (o whitelisting por IP del proveedor) **ninguna corrida puede salir por proxy**: el bloqueo de H-17 se vuelve irrelevante hasta tener proxies autenticados |
| H-19 | **Los proxies libres no sirven para este catálogo, medido**: el harvester propio probó 200 candidatos de 5 listas públicas auto-verificadas → 26 vivos (13%), 43 transparentes (devolvían la IP local) y **0 de 26** pasaron una request JSON real (11 devolvieron body no-JSON, 8 network, 5 timeout, 2 transient). Control: el objetivo directo respondía OK (Kitsu; Jikan no es alcanzable desde el sandbox por TCP) | `src/scripts/probeProxies.ts`, tres corridas (150/300/200 candidatos) | Cierra la vía "proxies gratis": o proveedor autenticado, o IP única con rate-limit honesto. El harvester queda como herramienta de re-probe (PR3) |

---

## 3. Fase 0 — Detener la hemorragia (config + 2 fixes)

**Objetivo**: dejar de quemar proxies y de perder datos silenciosamente **hoy**,
sin esperar al refactor. Todo config + ~50 líneas.

### 3.1 Config por fuente (la matemática compliant con el limiter actual por worker)

| Source | Hoy | Fase 0 | Cálculo |
|---|---|---|---|
| jikan | 1 worker (1/s + 60/min) | **1 worker (1/s + 50/min)** | Headroom sobre 60/min reales |
| jikanRelations | 80 workers (1/s + 40/min) | **2 workers (1/s + 28/min)** | 2/s y 56/min < 3/s-60/min |
| animeEpisodes | 60 workers | **1 worker** + gate por página (`services/animeEpisodes.ts`: 1/s + 50/min) | El limiter del worker solo cuenta inicios de tarea; el gate por página acota las ráfagas de una serie larga |
| animeMapping | 60 workers | **1 worker** + limiters de módulo a `(1/s, 50/min)` | Kitsu 60/min; cambio de 2 líneas |
| animeThemes | 60 workers | **2 workers (1/s + 40/min)** | Estático; ojo H-14 (buildId) |
| tvdbSeriesArtworks | 80 workers | **1 worker** | Cuota de key TVDB; H-04 |

### 3.2 Fixes

1. **No más pérdida silenciosa** (H-11): `shared/batchUpsert.ts` re-lanza el
   error (o devuelve `-1`); `core/genericManager.ts:saveData` marca la tarea
   `failed` y **no** `completed` cuando la escritura falla; `saveIfNeeded` deja
   de tragarse errores. Los tres repositorios que capturaban por su cuenta y
   devolvían `0` (`animeEpisodes`, `animeMapping`, `tvdbSeriesArtworks`) también
   re-lanzan.
2. **Timeout base** (H-05): `AbortSignal.timeout(30_000)` en `libs/fetcher.ts`
   y mensaje con `status` + snippet de body (stopgap del PR1).
3. **Correr en local**: `.env.example` (`TURSO_*`, `JIKAN_BASE`, `TVDB_API_KEY`),
   y README mínimo (`bun install` → `bun run build` → `bun run start <source>`,
   porque `workerPath` apunta a `./dist/...`).
4. **Build reproducible** (H-16): declarar `cheerio`, la dependencia que ya usa
   el path MAL heredado, para que `tsc` salga limpio. Ese path es código muerto
   (no hay source `mal`); **recomendado** borrarlo en su propio PR
   (`refactor: remove legacy MAL HTML path`, junto con `scripts/mal-test.ts`) y
   activar `noEmitOnError` para que un build roto no emita `dist/`.
5. **Ningún rechazo puede colgar la corrida** (hallazgos de la revisión de
   código): `flush()` no aborta el volcado de los demás taskTypes; el listener
   `worker.on('message')` captura rechazos (antes descartaba la promesa y
   `resolveCompletion()` nunca corría); `saveData` envuelve `getRepository()` y
   la propia marca de fallo (si la DB está caída, la tarea queda `in_progress`
   y el próximo arranque la re-encola — es la ruta recuperable); un processor
   sin resultados marca `completed` con 0 items en vez de dejar la tarea
   `in_progress`; `incrementErrors` cuenta tareas, no lotes; y los mensajes de
   error persistidos se sanean (`utils/sanitizeError.ts`: enmascara las
   credenciales del DSN y corta a 500 chars).

**Criterio de salida**: corrida de humo de 1.000 tareas de `jikanRelations`
→ 0 × 429, 0 tareas `completed` con escritura fallida, 0 corridas colgadas
> 10 min.

---

## 4. Fase 1 — Resiliencia de ingesta (3 PRs)

### PR1 — `fix/fetcher-resilience`

- Clasificación tipada de respuesta: `ok | rate_limit | blocked | not_found |
  transient | invalid_body | timeout | network`, con contexto (`status`, `url`,
  `retryAfter`, snippet).
- Retry con backoff exponencial + jitter **por tipo**: 404 sin retry;
  `blocked` → reporta el proxy y reintenta con otro; `rate_limit` → respeta
  `Retry-After`; `invalid_body` → sin retry + snippet.
- Timeouts reales: `headersTimeout`/`bodyTimeout` + `AbortSignal`.
- Sniff antes de `JSON.parse`: content-type + primer caracter (`{`/`[`), para
  detectar HTML/challenge.
- **Tests** (`bun test` + mock server `node:http`): matriz de clasificación,
  `Retry-After`, timeout, HTML sniff, no-retry en 404.
- **Criterio**: matriz cubierta + humo de 1k con la config de Fase 0 sin 429.
- **Nota**: `agent` se pasa a undici; bajo Bun es un no-op (H-17) y el fetcher
  ahora lo **avisa** en vez de fallar en silencio.
- **Deuda declarada (revisión de PR1)**: el peor caso de una tarea con proxy
  muerto puede estirarse a ~9 min (3 intentos × 30s × estrategias de
  `mapWithRetry`); PR2 lo acota con presupuesto por tarea (el fetcher ya acepta
  `signal`). `retryAfterMs` viaja sin tope en el error (el delay sí se acota):
  el rate gate de PR2 debe acotarlo al pausar por host. 502/504 quedan
  `transient` sin marca de proxy y 451 `blocked` con culpa al proxy: decidir
  antes de PR3. `body.text()` sin cap de tamaño: se resuelve al mover el fetch
  al padre (PR2).

### PR2 — `feat/rate-gate` (Opción A, D-S1)

- **Transporte (bloqueante, H-17)**: usar un transporte que **realmente enrute**
  por proxy: `fetch(url, { proxy })` nativo de Bun (verificado con proxies
  reales) o, bajo Node, `undici` real (ProxyAgent + CONNECT). El shim de
  `ProxyAgent` bajo Bun queda prohibido en el camino crítico.
- **Credenciales de proxy (H-18)**: aceptar `user:pass@ip:port` (y
  `PROXY_USER`/`PROXY_PASS` por env) al normalizar el listado; los proxies
  actuales responden 407 sin credenciales.
- **Inversión**: el padre fetchea (bucket global por host + proxies por request
  + retries centralizados); el worker solo mapea `{task, rawText} → data`.
- `core/rateGate.ts`: token bucket por host `{ perSecond, perMinute, burst }`,
  FIFO, pausa global por host ante `Retry-After`, caps por modo (A/B).
- Dispatch **pull**: el worker pide la siguiente tarea; el padre espera el
  bucket, fetchea y responde `{task, raw}` (o `{idle}`). Base natural del
  claim/lease de Fase 2.
- Config por host en `config/sources.ts`: jikan `3/s + 60/min`, kitsu
  `1/s + 60/min`, tvdb/animethemes medidos y documentados.
- **TVDB**: token único en el padre (H-04), `/login` detrás del bucket.
- **Criterio**: test de fairness (N llamadores concurrentes ≤ límite del host);
  tasa medida por host en logs; humo de 1k sin 429.

### PR3 — `fix/proxy-pool`

- Pool **por request** con selección LRU y rotación real (elimina el
  "1 proxy por worker", H-06).
- Scoring por causa (H-07): `blocked` penalización fuerte; `timeout` media;
  `not_found` **cero** (es de la fuente); `rate_limit` sin castigo al proxy.
- Cooldown exponencial con cap; umbral de muerte **con re-probe** (probe
  periódico contra endpoint barato; éxito → revive y resetea `failures`).
- Degradar sin `throw`: pool < workers deseados → se reduce concurrencia y se
  loguea (nunca aborta el run).
- `proxies.json` fuera de git (`data/proxies.json` gitignored + `.example` o
  env var) — hoy está commiteado con 100 proxies.
- **Tests**: proxy fake (éxito/bloqueo/timeout/muerte/revival), pool degradado
  no aborta.
- **Criterio**: suite en verde + run real con al menos un proxy muerto
  revivido.

---

## 5. Fase 2 — Postgres + cola crash-safe

> Depende de: `anidev-v2/openspec/changes/ingest-queue-postgres`.

- **Port**: `libs/db.ts` de libSQL a pg (`drizzle-orm/node-postgres` o
  `postgres-js`); schemas a `pg-core` espejo de anidev-v2 (con **drift check en
  CI** contra `anidev-v2/src/lib/db/schemas/`); `DATABASE_URL` local/prod +
  `DATABASE_URL_SCRAPER` en el compose. Cero DDL aquí (D-S3).
- **Cola**: claim `FOR UPDATE SKIP LOCKED` + lease + reaper + `dead_letter` +
  `refresh_after` (semántica en el change de anidev-v2).
- **Generadores idempotentes**: los `initialize*Tasks` pasan a UPSERT por lotes
  (inserta faltantes + re-arma vencidos); fuera `getExistingEntityIds` en
  memoria (H-10).
- **Heartbeat** de lease desde el padre mientras hay tareas en vuelo.
- **Modo A**: local (`docker compose up -d` de anidev) sembrado con
  `bun run db:clone-prod`.
- **Criterio**: `kill -9` en medio de un batch → al re-arrancar, 0 tareas
  perdidas (reaper re-encola) y 0 dobles claims con dos procesos concurrentes.

---

## 6. Fase 3 — Cobertura + promoción

> Depende de: `anidev-v2/openspec/changes/catalog-coverage-fields`.

- **Mappers** (H-12): studios/licensors con rol, broadcast (día/hora/tz),
  trailer, aired window, duration/source, rank/members/favorites.
- **Closure de dependencias** (H-13): FK faltante → se encola el padre
  (`artistResolver` como patrón) y la relación se reintenta; `skipped` para
  no-aplicables (`kitsu_id` ausente), nunca `failed`.
- **AnimeThemes** (H-14): migrar a `api.animethemes.moe`.
- **Backfill Modo A** por oleadas FK-safe (ver `docs/fill-and-refresh-strategy.md`).
- **Promoción diff-upsert** a prod: por clave natural, orden padres→hijos,
  validación referencial previa, transacción y rollback; política de huérfanos
  solo para filas no referenciadas por datos de usuario.
- **Modo B**: cron del host invoca el scraper con `--mode incremental`; refresco
  por política, presupuesto por corrida; métricas de cobertura por columna.
- **Criterio**: % de cobertura objetivo por columna nueva; schedule de un día
  devuelve datos reales; los VA links dejan de perderse (closure medible).

---

## 7. Verificación por PR

```bash
bun install
bun run build            # tsc + tsc-alias (workerPath vive en dist/)
bun test                 # bun:test + mock server (23 tests: fetcher + sanitizeError)
bun run start <source>   # smoke manual contra el stack local
```

- CI (`.github/workflows/ci.yml`): `bun install --frozen-lockfile` → `bun run build` → `bun test`, sin acceso a fuentes reales.
- Fase 2+: los tests de cola corren contra Postgres local (compose de anidev).
- Humo estándar: 1.000 tareas del source que toque, medir 429/block-rate,
  tareas colgadas y pérdidas de escritura.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| **`failed` es terminal (H-09)**: un fallo transitorio de escritura se vuelve un hueco permanente (el inicializador salta los entityIds existentes, `failed` incluidos) | Deuda explícita de Fase 0: el fallo queda visible con `error` y la corrida no se cuelga; la Fase 2 lo cierra con `dead_letter` + retry por `attempts` + re-arm por política |
| Los 100 proxies de `proxies.json` responden **407** (H-18) | El usuario aporta proxies autenticados; el código acepta `user:pass@ip:port` y `PROXY_USER`/`PROXY_PASS` |
| Límites reales de Jikan/Kitsu cambian sin aviso | Buckets configurables por env + métrica de block-rate (D.3) |
| Kitsu episodios es el cuello real de la cobertura | Modo B acotado a `airing` + broadcast day; números en la estrategia de fill |
| Promoción mal ordenada rompe FKs | Validación referencial previa + transacción + rollback (Track D, D.0) |
| Drift de esquema scraper ↔ anidev | Drift check en CI contra el repo de anidev |
| Cambios de esquema rompen el scraper en fase de transición | Modo A local siempre contra el espejo; prod solo cuando el change esté archivado |
