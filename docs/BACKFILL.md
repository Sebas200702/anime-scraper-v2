# BACKFILL — corrida inicial del catálogo (Modo A, una vez)

> Cómo llenar el catálogo completo con este repo y promocionarlo, sin quemar
> los proxies y pudiendo cortar/reanudar en cualquier momento. Estrategia de
> fondo: `docs/fill-and-refresh-strategy.md`. Branch de trabajo:
> `fix/fetcher-resilience` (todo lo de este runbook vive ahí).

## 0. Estado: listo para el backfill

| Requisito | Estado |
|---|---|
| Cola `ingest.*` (claim/lease/reaper/dead-letter/refresh/`skipped`) | ✅ 10 tests integración |
| Dispatcher 1 IP por tarea, `maxInFlight` 30 en backfill, cuota por (host, IP) | ✅ testeado |
| Fuentes (7): jikan, jikanRelations, animeMapping, animeEpisodes, tvdbSeriesArtworks, animeThemes, anilist | ✅ inicializador + servicio + processor + repo + contrato |
| AniList primaria de banners (`source`/`priority`, AniList 10 primero) + orden por `priority` en la app | ✅ verificado en vivo (8/8) + 146 tests en anidev |
| Vocabulario `media_type` normalizado al enum de la app | ✅ verificado en vivo |
| `task_policy` sembrada por script (`bun run db:seed-policy`) | ✅ |
| Re-arme de vencidos al arrancar (`rearmDueTasks`) | ✅ |
| Promoción diff-upsert FK-safe + `--dry-run` + rollback (nulls del origen jamás pisan valores del destino) | ✅ 5 tests herméticos |
| Espejo de DDL al día (`bun run schema:check`) | ✅ 19 fuentes |
| Seed offline del catálogo: 30.561 animes + 216.728 sinónimos + 18.858 `anilist_id` + 19.700 `kitsu_id` (cuota 0) | ✅ verificado en local |
| AniList extendido: banner + poster + tráiler/origen/fechas en 1 request; 30.553 tareas pre-sembradas | ✅ humo en vivo OK |
| CI: typecheck + build + unit + integración (Postgres real) + drift | ✅ |
| Gates locales | ✅ 120+ unit, 15 integración |

## 1. Pre-requisitos

- Postgres local con `scraper_local` migrada: `bun run db:migrate`.
- `.env` desde `.env.example`: `DATABASE_URL`, `TVDB_API_KEY`,
  `PROXY_USER`/`PROXY_PASS` si tus proxies exigen auth.
- `proxies.json` activo (100 ProxyScrape verificados 100/100, gitignored).
- **Correr desde tu red, no desde el sandbox**: Jikan no es alcanzable desde
  el sandbox (`TCP timeout` a `135.181.39.91:443`). Todo lo demás sí se
  verificó desde ahí.

## 2. Pre-check de red (obligatorio, ~3 requests, cuota despreciable)

```bash
# 1. Al menos 1 proxy llega a Jikan con JSON real
bun run proxies:probe --check-url https://api.jikan.moe/v4/anime/1 --stage1-only
# 2. Jikan directo también vale como control (si tu IP no está rate-limitada)
curl -s https://api.jikan.moe/v4/anime/1 | head -c 200
```

Si el probe falla en masa: no arranques el backfill (quemarías intentos).
Revisa `PROXY_USER`/`PROXY_PASS` (los ProxyScrape responden `407` sin auth).

## 3. Proxies y concurrencia (trial: 10 conexiones, 10 GB, 7 días)

- El código soporta **30 tareas en vuelo** (`SCRAPER_MODE=backfill`), pero el
  **trial solo permite 10 concurrentes**: corre el one-shot con tope 10.

```bash
export SCRAPER_MODE=backfill
export SCRAPER_MAX_WORKERS=10   # trial; 30 cuando el pool no tenga tope
```

- **Solo coste 0**: el one-shot se hace con el trial o con IP directa y
  rate-limit honesto. Las listas libres están descartadas con medición
  (4/150 pasan, 2.7%, varias con `self signed certificate`). No se recomienda
  nada de pago en este runbook.
- TVDB va **sin proxy y 1 en vuelo** (cuota por API key, `SINGLE_IP_SOURCES`):
  no consume trial.
- Presupuesto orientativo (JSON de KBs, muy por debajo de 10 GB): listing de
  Jikan (miles de páginas) → `details/characters/staff` (3×N) → mapping (N
  búsquedas Kitsu) → episodios (N×páginas, la cola larga) → TVDB (solo los que
  tengan `tvdbId`) → AniList (N) → AnimeThemes (~7.7k). La primera oleada manda:
  mira salud de proxies (`📡 Proxies — healthy/cooldown/dead`) y GB del trial
  antes de seguir. Todo es **reanudable** (leases + reaper): cortar no pierde nada.

## 4. Siembra de política (una vez, solo DB, sin red)

```bash
bun run db:seed-policy
```

## 5. Oleadas (orden FK-safe; cada comando = sembrar faltantes + drenar)

```bash
# Oleada 0 — seed offline (ya corrida en local, cuota 0, idempotente):
# 30.561 animes + sinónimos + anilist_id/kitsu_id desde anime-offline-database
DUMP_FILE=/tmp/opencode/offline.jsonl bun run db:seed-dump
# Descarga del dump (una vez, 6 MB):
#   curl -sL -o /tmp/opencode/offline.jsonl.zst https://github.com/manami-project/anime-offline-database/releases/download/2026-27/anime-offline-database.jsonl.zst
#   zstd -d -c /tmp/opencode/offline.jsonl.zst > /tmp/opencode/offline.jsonl
# (la URL `weekly` está muerta: usar el tag de la release)

# Oleada 1 — padres
# ⚠️ jikan/jikanRelations NECESITAN Jikan (caído desde 2026-10-15): bloqueados
# hasta que `proxies:probe --check-url https://api.jikan.moe/v4/anime/1` dé ≥1.
# Sin Jikan el orden que sí corre:
SCRAPER_MODE=backfill SCRAPER_MAX_WORKERS=10 bun run dev animeThemes  # independiente
SCRAPER_MODE=backfill SCRAPER_MAX_WORKERS=10 bun run dev anilist      # 30.553 tareas ya sembradas; banner+poster+tráiler/origen/fechas en 1 req
# Cuando Jikan vuelva:
SCRAPER_MODE=backfill SCRAPER_MAX_WORKERS=10 bun run dev jikan
SCRAPER_MODE=backfill SCRAPER_MAX_WORKERS=10 bun run dev jikanRelations
SCRAPER_MODE=backfill SCRAPER_MAX_WORKERS=10 bun run dev animeMapping  # Kitsu por título; confirma kitsu_id y resuelve tvdb_id

# Oleada 2 — derivadas (necesitan lo de la oleada 1)
#  episodios: necesita kitsuId del mapping · tvdb: necesita tvdbId + type · anilist: necesita mal_id
SCRAPER_MODE=backfill SCRAPER_MAX_WORKERS=10 bun run dev animeEpisodes
SCRAPER_MODE=backfill SCRAPER_MAX_WORKERS=10 bun run dev tvdbSeriesArtworks
# anilist ya drena en oleada 1 (solo necesita mal_id del seed offline)
```

## 5b. Qué queda bloqueado hasta Jikan (y por qué no bloquea el resto)

- **Fluye sin Jikan**: seed offline → AniList (banner/poster/tráiler/origen/fechas) → mapping Kitsu/TVDB por título → episodios → artworks TVDB → themes/música. Todo verificado o con humo en vivo.
- **Bloqueado**: listing de Jikan (descubrimiento de ids nuevos), `jikanRelations` (sinopsis, personajes/staff/VAs, studios/licensors, géneros, stats MAL, relations). Las columnas que los esperan ya existen y son nullables (migración `0004` en anidev + espejo): cuando Jikan vuelva se rellenan solas sin refill.
- `relatedAnime` del dump no trae tipos de relación → relations también esperan a Jikan.
- Productoras por nombre (dump) no se siembran: la junction exige `producer.mal_id`. Mismo caso géneros/temas (ids MAL).

- Re-correr el mismo comando es seguro (idempotente: solo crea lo que falta y
  drena lo `pending`; al arrancar re-arma leases vencidos, `skipped` y
  vencidos por política).
- `dead_letter` con `not_found` = la fuente no tiene ese id (hueco real, no
  reintentable). `dead_letter` con `rate_limit/blocked` = revisar proxies.
- Las 4 `dead_letter` de TVDB del humo (`series/5720` y cía) son del seed de
  prueba (filas sin `type` real): en el backfill el `type` viene de Jikan y se
  siembran bien.

## 6. Salud de la cola (sin correr nada)

```sql
-- Estado por fuente y tipo
SELECT source, task_type, status, count(*)
FROM ingest.task GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
-- `pending` ≈ 0 por tipo (salvo lo vencido por política) = oleada drenada.
-- dead_letter: distinguir not_found (ok) de rate_limit/blocked (proxies).

-- Banner default de un anime (lo que ve la app: primero por prioridad)
SELECT source, priority, left(src, 60)
FROM anime_media WHERE anime_id = 1 AND media_type = 'banner'
ORDER BY priority, id LIMIT 3;
-- Esperado: anilist/10 primero, tvdb/30 después.
```

## 7. Promoción a la DB de la app (local)

```bash
PROMOTE_TO_URL=postgres://anidev:anidev@127.0.0.1:5432/anidev bun run promote --dry-run
# revisa el reporte (inserts por tabla, 0 errores FK), luego sin --dry-run
PROMOTE_TO_URL=postgres://anidev:anidev@127.0.0.1:5432/anidev bun run promote
```

## 8. Después del backfill (no bloquea el one-shot)

- **P1 cobertura** (studios/licensors/broadcast/trailer/stats + `anilist_id`):
  necesita el DDL `catalog-coverage-fields` en anidev (dueño) + release; luego
  es **un task_type nuevo barrido una vez** (`30k ÷ 3 req/s ≈ 2.8 h`), no un
  refill. El mapper ya recibe esos campos del `/full` y los descarta porque
  las columnas no existen.
- **P2 descubrimiento Modo B** (seasons/schedules/delta + refresh airing-aware
  + Dokploy Schedules): incremental, post-backfill.
- **Prod**: aplicar en anidev el DDL `ingest.*` y la migración `0003`
  (`source`/`priority` en media). En local ya están.
- **Embeddings D.3** (`pgvector` en `anime`): sin dueño todavía; change propio
  pendiente en anidev.
