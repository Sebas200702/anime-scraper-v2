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
> **Estado**: **listo para el backfill** (ver `docs/BACKFILL.md`): Fases 0–3
> (incl. **P3: `skipped` + self-healing**), **fuente AniList** primaria de
> banners (con `source`/`priority` en las tablas de media, DDL aplicado en
> anidev local), `task_policy` sembrable (`bun run db:seed-policy`), re-arme de
> vencidos al arrancar y CI con integración + drift.
> Fuentes verificadas en vivo: **AnimeThemes**, **TVDB**, **Kitsu**, **AniList**;
> falta el humo de **Jikan desde tu red** (inaccesible desde el sandbox) antes
> de la oleada 1.
> Post-backfill (no bloquean el one-shot): P1 cobertura (DDL de anidev) y P2
> descubrimiento incremental; el closure quirúrgico necesita task types por-id.

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
| H-14 | `ANIME_THEMES_BASE` usaba `_next/data/{buildId}` con el buildId hardcodeado: **rotó y el source devolvía 404 en masa** | `config.ts`; verificado en vivo: el buildId del repo daba 404 y el nuevo (`6XveJp0W2eqE72rWpB3EU`) 200 | **Resuelto**: `libs/nextBuildId.ts` resuelve el buildId del HTML del sitio (cache 30 min, override por `ANIME_THEMES_BUILD_ID`) y **re-resuelve si un endpoint da 404** (deploy a mitad de corrida). Verificado en vivo: 5.013 animes en el listado y el mapping real de un payload (4 resoluciones con audio/video) |
| H-15 | Cero tests, README stub, sin `.env.example`, `proxies.json` (100 proxies) commiteado, `workerPath` hardcodeado a `./dist/...` | repo | No se puede correr en local ni verificar cambios |
| H-16 | **El repo no compilaba**: `src/processors/mal/*` importa `cheerio`, que nunca estuvo en `package.json` (el path MAL es código muerto: no hay source `mal` en `SOURCES`); y `tsc` emite `dist/` igual porque no hay `noEmitOnError` | `src/processors/mal/animeDetails.ts:1`; `package.json`; `src/scripts/mal-test.ts` (único consumidor) | Build "verde" engañoso: `dist/` se genera con errores de tipo |
| H-17 | **Los proxies no se usaban en runtime**: Bun resuelve `undici` a su implementación, donde `ProxyAgent` es un stub (`class ProxyAgent extends DispatcherBase { constructor() { super(); } }`) que ignora la URL. **Matiz verificado**: el proxy nativo de Bun (`fetch(url, { proxy })`) **sí enruta** (CONNECT incluido) y Node + undici real también; solo el shim de `ProxyAgent` bajo Bun es un no-op | probes con proxies reales: Node y Bun-fetch reciben el `407` **del proxy** (prueba de ruteo), Bun+`ProxyAgent` sale directo por la IP local | Todas las requests salían por la IP local → 429 y bloqueos con 80 workers; explica por qué "el pool nunca aprende" (H-06): nunca se usó. Fase 0 (menos workers) fue la única mitigación efectiva |
| H-18 | **Los proxies de `proxies.json` exigen credenciales**: los 4 muestreados responden `407 Proxy Authentication Required` (y el archivo solo tiene `ip:port`) | probe contra `api.ipify.org` y Jikan con 4 proxies del listado | Sin `user:pass` (o whitelisting por IP del proveedor) **ninguna corrida puede salir por proxy**: el bloqueo de H-17 se vuelve irrelevante hasta tener proxies autenticados |
| H-19 | **Los proxies libres no sirven para este catálogo, medido** (veredicto corregido tras H-21): de 150 candidatos de 5 listas públicas auto-verificadas, 16 vivos y **4 pasan (2.7%)** una request JSON real; el resto son timeouts/network y **varios fallan con `self signed certificate`** (interceptan TLS) | `src/scripts/probeProxies.ts`, corridas de 150/300/200/150 candidatos | Cierra la vía "proxies gratis": o proveedor autenticado, o IP única con rate-limit honesto. El harvester queda como herramienta de re-probe (PR3) |
| H-20 | **Bun solo enruta proxies HTTP/HTTPS**: `fetch(url, { proxy: 'socks5://…' })` ignoraría el proxy (issue `oven-sh/bun#16812` abierto), y Bun además lee `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` del entorno automáticamente (ignorando valores `socks`) | doc de Bun + test del transporte | Un pool SOCKS5 (habitual en listas libres y ofrecido por algunos proveedores) fallaría en silencio: el transporte ahora lo **rechaza con mensaje explícito**. Revisar también esas env vars en contenedores/shell |
| H-21 | **Tres trampas de medición que invalidaron los primeros veredictos**: (a) las exportaciones de proveedores traen **CRLF**; (b) pasar un proxy **sin esquema** (`ip:port`) hace que el runtime falle al instante o salga directo, porque exige `http://`; (c) cada API usa otra forma de payload, así que una aserción Jikan-shaped (`data.title`) marca como fallo un éxito de Kitsu (`data.attributes.canonicalTitle`) | probe con los 100 proxies de ProxyScrape: los 79 y 100 "fallos" consecutivos eran **falsos negativos de la aserción**; con la corrección pasan **100/100** (~450 ms, datos reales de Kitsu) | El transporte ahora **normaliza y valida** cualquier proxy string (esquema, socks, URL inválida) y el harvester describe el payload sin depender de la API. Regla: antes de concluir "los proxies no sirven", validar la aserción con un control directo |

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

- **✅ Implementado**: `core/rateGate.ts` (cuota por `(host, IP)` con FIFO y
  pausas por `Retry-After`), `core/taskDispatcher.ts` (una IP por tarea,
  `maxInFlight`, reporte de resultado al pool con `proxyFault`),
  `proxyManager.acquire()` (rotación LRU real) y `GenericManager` orquestando
  fetch + mapeo en el padre sin `worker_threads` (§6.6).
- **Pendiente (Fase 2)**: la cola en Postgres con claim/lease para reanudar sin
  perder slices; partir las tareas con fan-out interno (paginado de episodios)
  para que el gate cubra cada request.
- **Transporte (H-17) — resuelto**: `fetch(url, { proxy })` nativo de Bun
  (verificado 100/100 con proxies reales); normaliza cualquier proxy string y
  rechaza SOCKS explícitamente.
- **Credenciales de proxy (H-18) — resuelto**: `user:pass@ip:port` y
  `PROXY_USER`/`PROXY_PASS`.

### PR3 — `fix/proxy-pool`

- **Ya implementado (adelantado)**: degradar en vez de abortar
  (`allocateForWorkers` devuelve los disponibles y el manager arranca menos
  workers) y lectura defensiva de `proxies.json` (sin archivo se corre directo,
  no rompe el arranque); modo backfill por env (`SCRAPER_MODE=backfill`,
  `SCRAPER_MAX_WORKERS`) con un proxy por worker.
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

> Change `anidev-v2/openspec/changes/ingest-queue-postgres`.

- **✅ Implementado y verificado** (2026-10-15):
  - DB **local** `scraper_local` (Postgres 16, el mismo motor que prod) con el
    esquema de catálogo **espejado de anidev** (`bun run schema:mirror` +
    `schema:check` como drift check; verificado columna a columna: *idéntico en
    las 35 tablas compartidas*).
  - Cola `ingest.*` con **claim `FOR UPDATE SKIP LOCKED` + lease + reaper**,
    `attempts → dead_letter`, `refresh_after` por política (`task_policy` vía
    `refreshSecondsFor`, con default por taskType) y `ingest.run` para métricas.
  - Driver `drizzle-orm/node-postgres` + `pg`. Migraciones locales con
    drizzle-kit (`bun run db:generate` / `db:migrate`).
  - **9 tests de integración** contra la DB local (claim concurrente sin
    solapamiento, lease vencido → reaper, intentos agotados → dead_letter,
    fallo no reintentable, backoff por `Retry-After`, complete → refresh →
    re-arm, generador idempotente, stats).
  - **Smoke end-to-end real**: 3 animes → 9 tareas generadas → claim con lease →
    fetch por proxy → timeouts clasificados → 3 intentos con backoff →
    `dead_letter` con `last_error` (Jikan no es alcanzable desde este sandbox).
- **Pendiente**: promoción diff-upsert A→prod (Fase 3) y que anidev aplique el
  DDL de `ingest.*` en prod (en local lo crea este repo).
- **Gap detectado**: la media de **artist** no tiene tabla en el DDL de anidev
  (el router la avisa y la descarta): necesita columna/tabla en su esquema.

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

## 6.5 Proxies: estado y modo backfill (2026-10-15)

- **Verificado**: los 100 proxies del trial de ProxyScrape pasan **100/100** una
  request real (Kitsu, ~450 ms) y el egress es la IP del proxy. `proxies.json`
  (gitignored) está activo con esa lista.
- **Límites del trial**: 7 días, **10 GB**, **10 conexiones concurrentes** → el
  barrido completo (~3-5 GB) cabe, con techo de 10 slots.
- **Modo A (backfill)**: `SCRAPER_MODE=backfill SCRAPER_MAX_WORKERS=10 bun run dev <source>`.
  Una **IP por tarea** (ya no un proxy fijo por worker), con la cuota completa de
  cada IP.
- **Modo B (prod)**: sin proxies, una IP, ~3 min/día.
- **Pendiente**: medir desde el VPS contra **Jikan** (aquí no es alcanzable) y
  correr el humo de 1.000 tareas con el pool activo.

## 6.6 Arquitectura de ingesta: un solo proceso (2026-10-15)

Decisión refinada de D-S1: **el padre fetchea y mapea**, sin `worker_threads`.

- A las tasas reales (≤ decenas de req/s) el trabajo es I/O y el mapeo es
  liviano, así que un solo proceso basta.
- Elimina de raíz: limiter por worker (H-01), un proxy fijo por worker (H-06),
  workers colgados sin watchdog (H-05), el `dist/` obligatorio (H-15) y la
  imposibilidad de reportar al pool.
- El trabajo por tarea se inyecta en `TaskDispatcher` (`run`), así que si el
  perfilado algún día muestra que el mapeo cuesta CPU, se puede volver a
  offloadear a threads **sin tocar** el gate, el pool ni la cola.
- Limpieza hecha: `core/baseManager.ts`, `core/genericWorker.ts` y los tipos
  `WorkerData`/`WorkerMessage` eliminados.
- Deuda que queda (Fase 2/PR3): tareas que hacen fan-out interno
  (`fetchAnimeEpisodes` pagina por dentro) siguen limitadas por su propio limiter
  por worker; el gate por request completo llega al partir esas tareas en el padre.

## 6.7 Fuentes verificadas contra las APIs reales (2026-10-15)

| Fuente | Verificación | Estado |
|---|---|---|
| **AnimeThemes** | buildId resuelto del sitio; listado de **5.013 animes**; mapping real (4 musics + 4 resoluciones con audio/video); **7.736 tareas sembradas** en la cola | ✅ funciona (H-14 resuelto) |
| **TVDB** | `/login` 200, `/search?query=naruto` 50 resultados y `/series/78857/extended` con **134 artworks** (lo que consume el source) | ✅ funciona (key en `.env`, cuota por API key → 1 IP) |
| **Kitsu** | `/anime/1` 200 (y 100/100 proxies verificados contra él) | ✅ funciona |
| **AniList** | GraphQL por `idMal`: 200 con `bannerImage` (cuota real 30/min por IP) | ✅ funciona (fuente primaria de banners) |
| **Jikan** | **no alcanzable desde el sandbox** (TCP timeout) | ⚠️ verificar desde tu red |

## 6.8 Tareas sin dependencia: `skipped` + self-healing (P3, 2026-10-15)

Una tarea que no puede ejecutarse **todavía** (le falta un id cruzado o una fila
padre) ya no es un fallo: va a `skipped` con `skip_reason`, **no consume
reintentos** y se **re-arma al inicio de la siguiente corrida**.

- `libs/skippedTaskError.ts`: los services lo lanzan cuando falta la dependencia
  (`missing:kitsu_id` en episodios, `missing:tvdb_id` en artworks).
- `shared/dependencyTracker.ts` + `shared/fkFilter.ts`: el filtro de FK avisa de
  las filas que dejó fuera; el manager marca el lote `skipped` en vez de
  `completed` (antes: relación perdida en silencio, o fallo por FK → 3 intentos
  → dead_letter).
- `repositories/tasks.ts`: `skipTasks` / `rearmSkippedTasks` (self-healing).
- El dispatcher lo cuenta como `skipped` y **no penaliza al proxy**.
- Caso concreto que cierra: `animeThemes` sin filas de `anime` (el listado de
  Jikan va antes) ya no rompe por FK; el mapper filtra, avisa y la tarea se
  reintenta cuando el anime exista.

**Pendiente (closure quirúrgico)**: encolar el *padre* concreto que falta. Hoy
no es posible para las entidades de Jikan porque sus tasks son **por página**
(no hay hidratación por id). Requiere añadir task types por-id (`/characters/{id}/full`,
etc.) — cambio propio, no bloqueante.

## 6.9 AniList: fuente primaria de banners y variantes ordenadas (2026-10-15)

- **Nueva fuente `anilist`** (`anime_banner_hydration`): consulta GraphQL por
  `idMal` (cruce directo con nuestro `mal_id`, sin búsqueda por título) y mapea
  `bannerImage` → `anime_media (media_type='Banner')`. Cuota real medida: **30
  req/min por IP** (`x-ratelimit-limit`), aplicada por el `RateGate` por
  (host, IP) → los proxies multiplican la cuota.
- **DDL (anidev, migración `0003_violet_bastion.sql`)**: las **6 tablas de
  media** ganaron `source text` y `priority integer not null default 100`, con el
  índice extendido a `(fk, media_type, priority)` para la consulta de "mejor
  variante". El scraper refleja el cambio con `bun run schema:mirror`
  (drift check idéntico).
- **Contrato de orden**: varias fuentes escriben el mismo `media_type` (AniList y
  TVDB escriben banners) y el catálogo elige con
  `ORDER BY priority ASC, id ASC` → **AniList primero** (10) y TVDB después (30).
- **Convergencia**: `mediaRepository.saveMedia` inserta lo que falta y
  **reconcilia** `source`/`priority` de las filas ya presentes (antes, la media
  escrita sin esas columnas no se actualizaba).
- **Oportunidad anotada**: la misma consulta de AniList devuelve `Media.id`
  (id de AniList), así que cuando exista `anime_external_ids.anilist_id` (change
  `catalog-coverage-fields`) esta fuente lo puede llenar sin costo extra.

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
