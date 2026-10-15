# anime-scraper-v2

Ingesta del catálogo de **anidev-v2** (Track D).

- Plan de ejecución (Fase 0–3, hallazgos, PRs): [`ROADMAP.md`](./ROADMAP.md)
- Estrategia de fill/refresh (solo faltantes, Modo A/B):
  [`docs/fill-and-refresh-strategy.md`](./docs/fill-and-refresh-strategy.md)

## Requisitos

- [Bun](https://bun.com) ≥ 1.3
- Un `.env` (copia `.env.example`) con `TURSO_DATABASE_URL`,
  `TURSO_AUTH_TOKEN` y `TVDB_API_KEY`.

## Uso

```bash
bun install
bun run build            # tsc + tsc-alias → dist/
bun run start jikanRelations
```

`bun run start <source>` corre el inicializador de tareas y luego el manager del
source. Sources disponibles: `jikan`, `jikanRelations`, `animeThemes`,
`animeMapping`, `animeEpisodes`, `tvdbSeriesArtworks`.

El worker se carga desde `dist/` (`./dist/src/core/genericWorker.js`), por eso
`bun run build` es obligatorio antes de `start`.

## Proxies

El transporte acepta la **URL** del proxy: enruta bajo Bun con
`fetch(url, { proxy })` y bajo Node con el `undici` real. El `ProxyAgent` de
undici **no funciona bajo Bun** (su shim lo ignora, hallazgo H-17), así que el
worker pasa la URL, no un agent.

Formatos aceptados en `proxies.json` (array de strings; ver
`proxies.example.json`):

- `ip:port`
- `user:pass@ip:port`
- `http://host:port`, `https://host:port`, `socks5://host:port`

`proxies.json` está **fuera del control de versiones** porque puede llevar
credenciales.

Credenciales globales para proxies que no las traen: `PROXY_USER` / `PROXY_PASS`.

Verificar candidatos (descarga listas públicas, mide liveness, IP de egreso y
una request real; escribe `proxies.verified.json`):

```bash
bun run proxies:probe --limit 200 --concurrency 40
bun run proxies:probe --from ./proxies.txt --check-url https://kitsu.io/api/edge/anime/1
```

> ⚠️ Las listas públicas son de operadores desconocidos: úsalas solo contra
> fuentes **sin credenciales** (Jikan, Kitsu, AnimeThemes). Nunca mandes el token
> de TVDB por un proxy libre, y valida el payload antes de escribirlo al catálogo
> (pueden inyectar datos).
>
> Medición 2026-10-15: de 200 candidatos de 5 listas auto-verificadas, 26 vivos
> (13%) y **0** pasaron una request JSON real; 11 de ellos devolvieron un body
> modificado. Los proxies libres no son una base viable para este catálogo.

## Límites de fuentes (Fase 0)

El limiter actual es **por worker**, así que la tasa efectiva es
`maxWorkers × rateLimit`. Los valores de `src/config/sources.ts` están alineados
con las cuotas reales (Jikan 3/s y 60/min, Kitsu 60/min); la Fase 1 mueve el
límite a un bucket global en el proceso padre.
