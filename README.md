# anime-scraper-v2

Ingesta del catálogo de **anidev-v2** (Track D).

- Plan de ejecución (Fase 0–3, hallazgos, PRs): [`ROADMAP.md`](./ROADMAP.md)
- Estrategia de fill/refresh (solo faltantes, Modo A/B):
  [`docs/fill-and-refresh-strategy.md`](./docs/fill-and-refresh-strategy.md)

## Requisitos

- [Bun](https://bun.com) ≥ 1.4
- **Postgres local** (misma versión que prod: `postgres:16`). El stack de
  anidev-v2 ya lo levanta (`docker compose up -d`); la DB de ingesta por defecto
  es `scraper_local`.
- Un `.env` (copia `.env.example`) con `DATABASE_URL` (opcional: hay default
  local) y `TVDB_API_KEY`.

## Base de datos de ingesta

La cola (`ingest.*`) y el catálogo viven en **Postgres local**: el mismo motor
que prod, así que el DDL y las queries no cambian al promover.

```bash
# crear la DB y aplicar migraciones (una vez)
createdb -h 127.0.0.1 -U anidev scraper_local
psql -h 127.0.0.1 -U anidev -d scraper_local -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm'
bun run db:migrate

# el esquema del catálogo es un ESPEJO del de anidev-v2 (dueño del DDL)
bun run schema:mirror          # regenera src/schemas/*.ts desde ../anidev-v2
bun run schema:check           # falla si quedó desactualizado (drift check)
```

La cola da lo que la versión Turso no tenía: **claim atómico**
(`FOR UPDATE SKIP LOCKED`), **lease + reaper**, `attempts → dead_letter` y
`refresh_after` para re-armar lo vencido sin duplicar filas.

## Uso

```bash
bun install
bun run dev jikanRelations   # sin build: Bun ejecuta el TS directamente
bun run build                # tsc + tsc-alias → dist/ (typecheck/CI)
bun run start jikanRelations # sobre dist/
```

`bun run dev <source>` corre el inicializador de tareas y luego la ingesta del
source. Sources disponibles: `jikan`, `jikanRelations`, `animeThemes`,
`animeMapping`, `animeEpisodes`, `tvdbSeriesArtworks`, `anilist`.

## Banners y variantes de media

Cada asset vive en la tabla de su entidad (`anime_media`, `character_media`, …)
con dos columnas que permiten **tener varias variantes del mismo tipo y elegir
una**:

- `source` — de dónde vino (`anilist`, `tvdb`, `jikan`, `animethemes`).
- `priority` — **menor = se prefiere** (mapa en `MEDIA_SOURCE_PRIORITY`:
  AniList 10, Jikan 20, TVDB 30, AnimeThemes 40).

Los **logos de productora** (`producer_media`, `media_type = 'logo'`) vienen de
la ficha HTML de MAL (`/anime/producer/{id}`, fuente `malProducer`, prioridad 25)
y, cuando Jikan está disponible, de `/producers` (prioridad 20). La API v2 de MAL
no expone el logo y AniList no lo tiene.

AniList es la fuente **primaria de banners** (se consulta por `idMal`, su cuota
real es 30 req/min por IP). La variante preferida se obtiene con:

```sql
SELECT source, src FROM anime_media
WHERE anime_id = $1 AND media_type = 'Banner'
ORDER BY priority ASC, id ASC
LIMIT 1;  -- AniList primero, TVDB después
```

Los banners de AniList y de TVDB **coexisten** (variantes); no se pisa ninguna.
Si cambia la prioridad de una fuente, las filas ya guardadas se reconcilian en
la siguiente corrida.

## Tests

```bash
bun test                 # unit (sin DB)
bun run test:integration # cola ingest.* contra Postgres local (RUN_DB_TESTS=1)
```

## Arquitectura de ingesta

Un solo proceso: el **padre** fetchea y mapea, con una **IP por tarea** y la
cuota aplicada por `(host, IP de salida)` (`core/rateGate.ts` +
`core/taskDispatcher.ts`). No hay `worker_threads`.

- El pool se alimenta con el resultado real de cada request: éxito limpia el
  proxy, y solo se penaliza cuando `FetchError.proxyFault` lo justifica (un 404,
  un 429 o credenciales inválidas no castigan la IP).
- Un `Retry-After` pausa esa `(host, IP)` concreta, no todas.
- Cuotas por IP en `SOURCE_HOSTS`: Jikan 3/s y 60/min, Kitsu 60/min,
  AnimeThemes 2/s, TVDB 1/s y 30/min **en una sola IP** (su cuota es por API
  key, así que repartirla entre proxies no multiplica nada).

## Proxies

El transporte acepta la **URL** del proxy: enruta bajo Bun con
`fetch(url, { proxy })` y bajo Node con el `undici` real. El `ProxyAgent` de
undici **no funciona bajo Bun** (su shim lo ignora, hallazgo H-17), así que el
worker pasa la URL, no un agent.

Formatos aceptados en `proxies.json` (array de strings; ver
`proxies.example.json`):

- `ip:port`
- `user:pass@ip:port`
- `http://host:port`, `https://host:port`

**SOCKS no está soportado**: Bun solo enruta proxies HTTP/HTTPS en
`fetch(url, { proxy })` (un `socks5://` se ignoraría en silencio), así que el
transporte lo **rechaza con un mensaje explícito**. Si tu proveedor solo ofrece
SOCKS, usa su endpoint HTTP/HTTPS, puentea con `gost`/`microsocks`, o corre bajo
Node (undici `Socks5ProxyAgent`).

Ojo también con `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` en el entorno: **Bun las
lee automáticamente** y toda request saldría por ahí (ignora valores `socks`).

`proxies.json` está **fuera del control de versiones** porque puede llevar
credenciales.

### Modos

| Modo | Cómo | Para qué |
|---|---|---|
| **incremental** (default) | `bun run dev <source>` | prod: una IP, ~3 min/día |
| **backfill** | `SCRAPER_MODE=backfill bun run dev <source>` | barrido de una vez: **30 tareas en vuelo**, una IP por tarea |

En modo backfill el pool usa hasta `min(30, tamaño del pool)` proxies (si hay
menos, arrancan menos en vez de abortar). `SCRAPER_MAX_WORKERS` acota ese número.

Credenciales globales para proxies que no las traen: `PROXY_USER` / `PROXY_PASS`.

Verificar candidatos (descarga listas públicas, mide liveness, IP de egreso y
una request real; escribe `proxies.verified.json`):

```bash
# solo tu lista de proveedor (sin listas públicas ni proxies.json)
bun run proxies:probe --only ~/Downloads/mi-proveedor.txt --concurrency 10

# mezcla: listas públicas + tu archivo + proxies.json actual
bun run proxies:probe --limit 200 --concurrency 40
bun run proxies:probe --from ./proxies.txt --check-url https://kitsu.io/api/edge/anime/1
```

`--only <archivo>` es el modo para validar un proveedor (mide exactamente esa
lista); `--check-url <url>` cambia el objetivo de la etapa 2 (por defecto Jikan;
usa Kitsu si tu red no alcanza `api.jikan.moe`); `--stage1-only` omite la etapa
2; `--out <archivo>` cambia la salida.

> ⚠️ Las listas públicas son de operadores desconocidos: úsalas solo contra
> fuentes **sin credenciales** (Jikan, Kitsu, AnimeThemes). Nunca mandes el token
> de TVDB por un proxy libre, y valida el payload antes de escribirlo al catálogo
> (pueden inyectar datos).
>
> Medición 2026-10-15: de 200 candidatos de 5 listas auto-verificadas, 26 vivos
> (13%) y **0** pasaron una request JSON real; 11 de ellos devolvieron un body
> modificado. Los proxies libres no son una base viable para este catálogo.

**La cuota es por IP**: el `RateGate` la aplica por `(host, IP de salida)` con
los límites de `SOURCE_HOSTS`, y cada tarea usa una IP distinta del pool. TVDB es
la excepción (cuota por API key): va sin proxy y con una sola tarea en vuelo.

## Actualizaciones incrementales (Modo B)

En prod **no se re-barre el catálogo**. El listado y los datos terminados quedan
con `refresh_after = NULL` (nunca); solo se refresca lo que puede cambiar:

- **hot set** (`src/repositories/tasks.ts → hotAnimeIds`): `status = 'Currently
  Airing'`, `Not yet aired` con estreno en ≤30 d, y `aired_to` en los últimos
  7 d (ventana de cierre: la pasada final cuando termina la temporada).
- **Por tarea**: `anime_details_hydration` y `anime_episodes_hydration` cada
  24 h en airing; el catálogo terminado, nunca. El resto de tipos usan su
  cadencia cold (bulks 7–30 d, personas/mapping 180 d, etc.).
- **La ficha `/full` actualiza la fila `anime`** (`status`, `episodes`, `score`,
  `aired_*`, `broadcast_*`, stats, tráiler). Antes solo escribía junctions y el
  `status` solo cambiaba re-barriendo el listado.
- **Descubrimiento sin Jikan**: `malDiscovery` (MAL API v2) lista la temporada
  actual y la siguiente y los rankings `upcoming`/`airing`; los ids nuevos entran
  como fila mínima de `anime` y reciben sus tareas derivadas en la misma corrida
  (ver [Descubrimiento de anime nuevos](#descubrimiento-de-anime-nuevos-sin-jikan)).
- **Resiliencia**: el dispatcher corta una fuente tras 10 fallos transitorios
  seguidos (circuit breaker) y devuelve a `pending` lo claimado sin ejecutar; el
  discovery diario re-encola las `dead_letter` por timeout/red/bloqueo.
- **Fallback de ficha**: `anime_mal_details_hydration` (MAL API v2) actualiza
  `status`, `episodes`, `score`, `broadcast`, `aired_*` y stats cada 24 h en
  airing. Es la red de seguridad cuando Jikan no está disponible (su API se cayó
  globalmente el 2026-10-24) y también la fuente de stats de MAL.

```bash
bun run incremental:hot        # cada 15 min en prod (presupuesto 150/fuente)
bun run incremental:slow       # cada 6 h (manga, personas, temas…)
bun run incremental:discover   # diario: malDiscovery (anime nuevos) + derivados
bun run incremental:normalize  # one-off tras cambiar la política (o en el seed)
```

Todas respetan `--budget=N` (por fuente), `--deadline=SEGUNDOS` y un
advisory lock **por fuente** (dos ticks de la misma fuente no compiten; un
relleno de personas puede correr en paralelo al hot). Cada corrida queda en
`ingest.run`.

### Descubrimiento de anime nuevos (sin Jikan)

Jikan está retirado (`RETIRED_SOURCES`): sus tareas quedan como historial. Los
anime nuevos los descubre `malDiscovery` (MAL API v2, `api.myanimelist.net`,
misma cuota y ruteo de IP que `mal`), con 4 tareas de anime que se refrescan
cada 3 h desde el grupo hot. Son ~15 requests que traen estado, episodios y
fechas de todo lo que está en emisión o por estrenarse, así que los estados se
actualizan en bloque varias veces al día (el discover diario siembra además las
tareas derivadas de los títulos nuevos):

| Tarea | Endpoint |
|---|---|
| `mal_discovery_season_current` | `anime/season/{año}/{temporada}` actual |
| `mal_discovery_season_next` | la siguiente (fall Y → winter Y+1) |
| `mal_discovery_ranking_upcoming` | `anime/ranking?ranking_type=upcoming` |
| `mal_discovery_ranking_airing` | `anime/ranking?ranking_type=airing` |

Todas piden `limit=500`, los campos del ranking y `nsfw=true`, y paginan hasta
una página corta. La temporada se calcula al hacer el fetch (winter = ene–mar),
así las viejas no se siguen refrescando.

`bun run incremental:discover` siembra y drena `malDiscovery` **antes** de los
derivados: cada id desconocido con título entra como fila mínima de `anime`
(`mal_id`, `title`, `type`, `status`, `episodes`, `year`, `season`, con
`ON CONFLICT DO NOTHING`: un título existente nunca se pisa) y recibe el parche
de MAL y sus tareas derivadas en la misma corrida. Los rankings de `mal` (bulk
semanal) usan el mismo camino.

Sin `MAL_CLIENT_ID` el discover imprime un aviso explícito y deja constancia en
`ingest.run` (`notes.warnings`, solo historial); `incremental:report` lo muestra
arriba (vista F: cola de `malDiscovery`) y `/stats` lo expone en `warnings`,
ambos calculados del env (`MAL_CLIENT_ID`). Las tareas siguen
quedando `skipped` (`missing:MAL_CLIENT_ID`) y se re-arman solas.

**Al pasar de 20 h a 3 h** (cambio de política): `db:seed-policy` no pisa filas
existentes de `ingest.task_policy`, y la política de la DB manda sobre la del
código. En una DB que ya tenía las filas de 20 h, actualizalas una vez:

```sql
UPDATE ingest.task_policy
SET refresh_interval_seconds = 10800, refresh_interval_airing_seconds = 10800
WHERE task_type IN ('anime_mal_discovery_season_hydration',
                    'anime_mal_discovery_ranking_hydration');
```

**Primera carga (Modo A, local)**: corré el discover contra la base local y
después promové. La primera corrida es una **ráfaga**: todos los ids que faltan
entran juntos y siembran sus derivados (ficha MAL, episodios, AniList,
personajes…), así que el primer drenado tarda más que los diarios.

```bash
bun run db:seed-policy           # política de los nuevos task types
bun run incremental:discover     # contra la base local
bun run promote --only=anime,genre,theme,demographic,producer,anime_genre,anime_theme,anime_demographic,anime_producer,anime_media --insert-only --dry-run
bun run promote --only=anime,genre,theme,demographic,producer,anime_genre,anime_theme,anime_demographic,anime_producer,anime_media --insert-only
```

Esas son las tablas que toca una fila mínima con su parche de MAL (fila
`anime`, taxonomía y studios con sus junctions, póster). Va con `--insert-only`:
la base local es más vieja que prod y el upsert por defecto pisaría valores más
nuevos del destino; así solo entran las filas que faltan. El resto de tablas
las llenan los derivados en las corridas siguientes y se promueven como siempre.

Ojo: tras el deploy, los rankings semanales de `mal` (`all`, `bypopularity`,
`favorite`, además de `airing`/`upcoming`) también insertan directamente en producción los ids que el
catálogo no tenga (mismo camino de fila mínima), sin pasar por la promoción.

### Descubrimiento de manga nuevos (sin Jikan)

`malDiscovery` también descubre manga con una quinta tarea,
`mal_discovery_manga_ranking_bypopularity`
(`manga_mal_discovery_ranking_hydration`):
`manga/ranking?ranking_type=bypopularity` con `limit=500`, `nsfw=true` y la
ficha que MAL acepta en listas (portada, títulos alternativos, fechas,
sinopsis, géneros, score, popularidad y miembros; `MANGA_DISCOVERY_FIELDS` en
`src/services/malDiscovery.ts`).
El ranking de manga no tiene `upcoming`/`publishing`, así que se recorre
entero; `bypopularity` ordena por miembros (no por nota), por eso un título
nuevo sin score entra igual. Son ~150 requests (estimado), así que se refresca
**semanal** (7 d − 4 h, para que el discover diario lo encuentre
vencido al séptimo día).

El barrido es **reanudable**: cada página se guarda al llegar y el cursor
(siguiente offset) queda en el payload de la tarea (`offset`). Un
timeout/5xx/error de red reintenta esa página (3 intentos, backoff 2 s y 4 s);
si aun así falla, la tarea falla con lo ya guardado y el cursor intactos y el
reintento sigue desde ahí. Cada intento procesa como mucho 40 páginas o 180 s
(lo primero que llegue; `MANGA_SWEEP_LIMITS` en `src/config/malDiscovery.ts`),
muy por debajo del deadline del discover (600 s) y del lease (900 s); si no
terminó, la tarea vuelve a `pending` sin gastar intento y la misma corrida (o
la siguiente) continúa. Al llegar a la página corta el cursor vuelve a 0 y la
tarea se completa con el refresco semanal, sin re-armarse antes.

Cada id desconocido con título entra como fila mínima de `manga` (`mal_id`,
`title`, `type` = `media_type` o `manga`, `status`, `chapters`, `volumes`,
`year`) con `ON CONFLICT (mal_id) DO NOTHING`: los manga existentes no se
tocan (su ficha la mantiene `malManga`). A los recién insertados (los que
devuelve el `RETURNING`) se les aplica la ficha del ranking con `saveMalManga`,
así llegan completos; `malManga` sigue añadiendo después `background`,
relaciones y serialización, que el endpoint de listas no publica. La API v2
no tiene `members`: `members`/`scored_by` salen de
`num_list_users`/`num_scoring_users` (también en la ficha de `malManga`).
En la misma corrida los derivados
`malManga`, `malMangaCharacters` y `malMangaPage` siembran sus tareas para los
nuevos. Primera carga en Modo A: discover local y después
`bun run promote --only=manga,genre,manga_genre,manga_media,manga_title_synonym,manga_external_ids --insert-only`
(la ficha del ranking ya escribe esas tablas; el resto lo llenan los derivados y
se promueven como siempre).

### Seed de una DB ya ingerida

```bash
bun run db:ingest-schema        # crea ingest.* (idempotente)
bun run db:seed-policy          # política en la DB (no pisa ediciones)
bun run db:seed-task-history    # reconstruye tareas jikanRelations ya hechas
bun run db:seed-producer-pages  # páginas de /producers (logos + about/established)
bun run incremental:normalize   # refresh_after + prioridad según la política
```

`seed-task-history` marca `completed` los anime que **ya tienen datos** (géneros,
reparto, staff) y deja `pending` solo los huecos reales: sin él, el primer
discovery crearía 91k tareas y volvería a bajar todo el catálogo.

Para una DB de destino con esquema parcial (tablas nuevas o columnas añadidas),
la promoción se puede acotar:

```bash
bun run promote --only=manga,manga_staff,music_stream   # diff-upsert de un subconjunto
```

Si el origen es más viejo que el destino (p. ej. una carga en Modo A sobre un
clon de hace días), `--insert-only` inserta solo las filas que faltan y nunca
actualiza las existentes (funciona con cualquier clave, tenga o no columna `id`,
y una fila que el destino reciba en paralelo se omite en vez de chocar):

```bash
bun run promote --only=anime,anime_character,character --insert-only --dry-run
```

El copy inicial de la cola entre dos Postgres es un `pg_dump --data-only -t
ingest.task -t ingest.task_policy` + `psql` (incluye el `setval` de la
secuencia): conserva los ~594k estados de tarea y evita re-ingestar.


### Reparto de manga (MAL)

`malMangaCharacters` (`manga_mal_characters_hydration`) trae el reparto de cada
manga desde `/manga/{id}/_/characters` (ids reales de MAL; solo inserta, no toca
los vínculos de AniList). Va en el grupo slow (150/6 h); refresco cada 180 d.
Carga inicial one-off (~20 h a 1 req/s con una IP; con proxies y
`SCRAPER_MODE=backfill`, la cuota se reparte por IP de salida):

```bash
bun run malMangaCharacters:seed-tasks
bun run db:seed-policy
bun src/scripts/incremental.ts --drain --sources=malMangaCharacters --budget=80000 --deadline=86400
```

Con un pool de proxies grande, `MAL_MANGA_CHARACTERS_MAX_WORKERS=90` y
`--max-in-flight=90` (con `SCRAPER_MODE=backfill`) suben las tareas en vuelo; la
cuota sigue siendo 1 req/s por IP. Medido 2026-11-23 con 100 proxies: ~1.500
mangas/min, 70k en ~45 min.

Durante la carga, pausá el cron `incremental:slow`: el límite de 1 req/s es por
proceso, y otro proceso que consulte `myanimelist.net` desde la misma IP lo
duplicaría. Si una persona ya existe como personaje solo de AniList en ese
manga, la carga agrega también al personaje de MAL (no se busca por nombre):
antes de promover, unificá esos duplicados en la base local.

## Despliegue (Dokploy)

- `Dockerfile`: Bun 1.4.2, build (`tsc` + `tsc-alias`) y runtime de producción.
  El contenedor corre `src/server.ts` (health/stats) y los schedules de Dokploy
  lanzan el incremental por `docker exec`.
- `GET /health` → 503 si la DB no responde o no hay corrida en 8 h.
  `GET /stats` → cola por fuente/tipo/estado, vencidas, hot set y últimas
  corridas (protegido con `STATUS_TOKEN` si se define).
- Schedules (zona UTC): `*/15 * * * *` hot, `0 */6 * * *` slow,
  `0 3 * * *` discovery y dos de relleno one-off que corren en paralelo (cada
  uno usa su host): `fill-api` (`0,30 * * * *`, `malPerson,malCharacters`) y
  `fill-web` (`1,31 * * * *`, `malPeople,malMangaPage`). Cuando el `pending` de
  esas fuentes llegue a 0 se desactivan sin tocar nada más.
- El scraper escribe **directo en la Postgres de anidev** (`DATABASE_URL`). El
  esquema `ingest.*` lo crea el contenedor al arrancar; el catálogo (DDL de
  anidev) no se toca.

