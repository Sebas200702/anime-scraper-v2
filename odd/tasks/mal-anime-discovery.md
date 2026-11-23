# mal-anime-discovery

Discover new anime without Jikan (retired): MAL API v2 season lists and
`upcoming`/`airing` rankings insert unknown ids as minimal `anime` rows, so the
daily `--discover` gives them their derived tasks in the same run.
Branch: `feat/mal-anime-discovery` (base `main` a74601f). PR 1 = anime.
Rollout: Mode A locally first, then `promote` (L2).

## Specs

- **S1** MAL ranking saves INSERT unknown anime ids as minimal rows (`mal_id`,
  `title`, `type`, `status`, `episodes`, `year`, `season` — mapped with the
  existing TYPE/STATUS maps) with `ON CONFLICT DO NOTHING`, before the existing
  patch; never overwrite an existing title; skip nodes without title. The
  processor carries `title`.
- **S2** New source `malDiscovery` (host `api.myanimelist.net`, same limits as
  `mal`, same IP routing as `mal`) with tasks for the current and next MAL
  season (`anime/season/{year}/{season}`, `fields` = RANKING_FIELDS,
  `limit=500`, paging until a short page, `nsfw=true`) and the `upcoming` and
  `airing` rankings, refreshed daily (hot 24 h; cold 24 h). Its saves go
  through the S1 insert-unknown path. Season math correct at year boundaries
  (winter = Jan–Mar, spring, summer, fall; next of fall Y = winter Y+1).
- **S3** `LISTING_SOURCES = ['malDiscovery']`: `--discover` seeds and drains it
  before the DERIVED initializers. `malDiscovery` is not retired and is not
  seeded as a derived source.
- **S4** Missing `MAL_CLIENT_ID` is loud: the discover run prints an explicit
  warning line and `incremental:report` (and `/stats`) shows it; the task
  `skipped` semantics stay.
- **S5** README section: discovery without Jikan, first-load note (Mode A
  locally, then `bun run promote --only=…` with the tables a minimal anime row
  touches) and the first-run burst.

## Tasks

| ID | Specs | Task | Route | Commit |
|----|-------|------|-------|--------|
| T1 | S1 | Processor carries title; insert-unknown SQL builder; `saveMalRanking` inserts then patches | worker | pending (uncommitted) |
| T2 | S2 | `malDiscovery` source: season math, service, processor, repository, initializer, policy | worker | pending (uncommitted) |
| T3 | S3, S4 | Listing/derived split, discovery ordering, missing-client-id warning (run, report, /stats) | worker | pending (uncommitted) |
| T4 | S5 | README | worker | pending (uncommitted) |
| T5 | — | Verify (`bun test`, tsc, build, integration on a throwaway DB, live check) | worker | pending (uncommitted) |

## Log

- **L1** (user request): "no deberiamos eliminar las tareas que estan suscritas a jikan"
- **L2** — Elegido: Modo A: local primero, después promote
- **L3** — Design: season tasks have stable ids (`mal_discovery_season_current`,
  `mal_discovery_season_next`, payload `seasonOffset` 0/1); the service computes
  `{year, season}` at fetch time, so old seasons never keep refreshing daily.
  `malDiscovery` uses its own task types (`anime_mal_discovery_*`) so its 24 h
  policy does not collide with `mal`'s 7-day `anime_mal_ranking_hydration`
  (`sourceOfTaskType` picks the first source declaring a type).
- **L4** — T1–T5 implemented test-first. RED observed: `processMalRanking`
  title undefined (S1); new modules missing (S2–S4); staleness view F missing
  (S4). Integration on a throwaway DB (`scraper_disc_scratch`, dropped
  afterwards) found a latent defect: `saveAnimeMalDetails` called
  `values([])` on `anime_producer` for a batch without studios and threw
  ("values() must be called with at least one value"); guarded. Results:
  `bun test` 269 pass / 66 skip / 0 fail; tsc OK; build OK; integration 46 pass.
  Live check skipped: `MAL_CLIENT_ID` is not set in the scraper's local env.
