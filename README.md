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

## Límites de fuentes (Fase 0)

El limiter actual es **por worker**, así que la tasa efectiva es
`maxWorkers × rateLimit`. Los valores de `src/config/sources.ts` están alineados
con las cuotas reales (Jikan 3/s y 60/min, Kitsu 60/min); la Fase 1 mueve el
límite a un bucket global en el proceso padre.
