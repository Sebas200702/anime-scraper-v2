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
  `airing` rankings, refreshed daily (hot 20 h; cold 20 h — under a day so the daily discover
  always finds them due). Its saves go
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
  touches, with `--insert-only` so an older local source never overwrites
  newer target values), the first-run burst, and that the weekly `mal`
  rankings (`all`/`bypopularity`/`favorite`) also insert unknown ids directly
  in production after deploy.
- **S6** (PR 2, branch `feat/mal-manga-discovery`) New manga without Jikan:
  `malDiscovery` gets task type `manga_mal_discovery_ranking_hydration` (one
  task, `mal_discovery_manga_ranking_bypopularity`) fetching
  `manga/ranking?ranking_type=bypopularity&limit=500&offset=…&fields=id,title,media_type,status,num_chapters,num_volumes,start_date&nsfw=true`,
  paging until a short page, refreshed weekly (7 d − 4 h, same margin
  reasoning as the 20 h). Unknown ids are inserted as minimal `manga` rows
  (`mal_id`, `title`, `type` = `media_type` or `'manga'`, `status`,
  `chapters`, `volumes`, `year`, mapped through `processMalManga`) with
  `ON CONFLICT (mal_id) DO NOTHING` (targeted: other errors stay loud, L6);
  existing rows are never touched; nodes without title are skipped. The
  DERIVED `malManga`/`malMangaCharacters`/`malMangaPage` initializers seed the
  new ids in the same `--discover` run. README documents it.

## Tasks

| ID | Specs | Task | Route | Commit |
|----|-------|------|-------|--------|
| T1 | S1 | Processor carries title; insert-unknown SQL builder; `saveMalRanking` inserts then patches | worker | pending (uncommitted) |
| T2 | S2 | `malDiscovery` source: season math, service, processor, repository, initializer, policy | worker | pending (uncommitted) |
| T3 | S3, S4 | Listing/derived split, discovery ordering, missing-client-id warning (run, report, /stats) | worker | pending (uncommitted) |
| T4 | S5 | README | worker | pending (uncommitted) |
| T5 | — | Verify (`bun test`, tsc, build, integration on a throwaway DB, live check) | worker | pending (uncommitted) |
| T6 | S6 | Manga ranking discovery: task/config/policy, service, processor, insert-unknown SQL, repository, README, unit + integration tests | worker | pending (uncommitted) |

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
- **L5** — Verifier blocker fixed: `insertMissingBatch` ended in `RETURNING id`,
  so `--insert-only` failed on tables without `id` (`column "id" does not
  exist`). Now `ON CONFLICT DO NOTHING` + `rowCount` (any key; a concurrent
  insert in the target is skipped, only real inserts counted). RED/GREEN in
  `tests/promoteInsertOnly.integration.test.ts` (added to `test:integration`).
  Advisories: README first-load promote uses `--insert-only` + note on weekly
  `mal` rankings inserting in prod; malDiscovery refresh 24 h → 20 h;
  `saveMalRanking` counts each node once; incremental `notes.warnings` comment
  corrected. Results: `bun test` 271 pass / 70 skip / 0 fail; tsc OK; build OK;
  integration 50 pass (scratch `scraper_io_scratch`, dropped afterwards).
- **L6** — Re-verify FAIL: the untargeted `ON CONFLICT DO NOTHING` in `insertMissingBatch` changed DEFAULT promote — with a target sequence behind `max(id)` a media row was silently dropped and reported as identical (baseline aborted on `anime_media_pkey`). Fixed: plain INSERT counted with `rowCount` (no `RETURNING id`), so `--insert-only` works on tables without `id` and default promote fails loudly as before. Regression test added (RED at 24a8d15, GREEN now). Integration 51/51.
- **L7** — S6 (PR 2, manga) implemented test-first. RED observed: `tests/malMangaDiscovery.test.ts` failed on the missing `repositories/mal/mangaDiscoverySql.js` module. Choice: only `bypopularity` — the manga ranking has no `upcoming`/`publishing`, so a full sweep is unavoidable; `bypopularity` orders by members, not score, so an unscored new title is still listed (assumption, not verified end-to-end). Weekly (7 d − 4 h). Minimal rows reuse `processMalManga` for the type/status/year vocabulary; insert is `ON CONFLICT (mal_id) DO NOTHING` (targeted, L6). The DERIVED `malManga`/`malMangaCharacters`/`malMangaPage` already run after listing in `runDiscovery`. Integration on `scraper_mdisc_scratch` (dropped afterwards): 52/52 pass. Live check: 2 MAL requests used; page offset 0 returned 500 nodes; the offset-80000 probe result and the unknown-to-local count were lost because the script crashed on the local DB (`scraper_local` does not exist under the default URL), so the total request count (~150) is still an estimate.
