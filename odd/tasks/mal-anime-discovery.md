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
  **Amendment (L9, branch `fix/manga-sweep-resumable`):** the sweep is
  resumable and failure-tolerant. Each fetched page's unknown manga are saved
  immediately and the cursor (next offset) is persisted in the task payload
  (`offset`); a retry resumes from it. A timeout/5xx/network error on a page
  retries that page (3 attempts, backoff 2 s, 4 s) before the task fails;
  failure keeps the cursor and the pages already saved. Each attempt is
  bounded (40 pages or 180 s, whichever first) and, when it ends without
  finishing, the task returns to `pending` without consuming an attempt (same
  run or the next one continues). A short page completes the sweep: the cursor
  resets to 0 and the task completes with the weekly refresh (7 d − 4 h), so
  there is no re-arm loop after completion. The anime season/ranking tasks'
  requests and behavior are unchanged (byte-identical URLs, test).

## Tasks

| ID | Specs | Task | Route | Commit |
|----|-------|------|-------|--------|
| T1 | S1 | Processor carries title; insert-unknown SQL builder; `saveMalRanking` inserts then patches | worker | 9ae168e |
| T2 | S2 | `malDiscovery` source: season math, service, processor, repository, initializer, policy | worker | pending (uncommitted) |
| T3 | S3, S4 | Listing/derived split, discovery ordering, missing-client-id warning (run, report, /stats) | worker | pending (uncommitted) |
| T4 | S5 | README | worker | pending (uncommitted) |
| T5 | — | Verify (`bun test`, tsc, build, integration on a throwaway DB, live check) | worker | pending (uncommitted) |
| T7 | S6 | Resumable manga sweep: per-page save, payload cursor, per-page retry, per-attempt budget + re-arm, README, unit + integration tests | worker | pending (uncommitted) |
| T8 | S6 | Manga ranking carries the full list-endpoint sheet (L12): wider fields, fresh ids get synopsis/cover/genres/synonyms/scores via `saveMalManga`; `num_list_users`/`num_scoring_users` → members/scored_by | inline + worker | done |
| T9 | S6 | AniList link pass for manga (L14): bulk `idMal_in` (50/request) fills `manga_external_ids.anilist_id` + fill-only `country_of_origin` and AniList banner for manga missing an AniList id; resumable cursor; feeds `initializeAnilistMediaTasks` | worker | done (abc8a7c) |
| T10 | S6 | Manga ranking as bulk catalog refresh (L16): for EXISTING manga the weekly sweep fills null columns and updates volatile MAL stats (status, chapters, volumes, score, scored_by, members, popularity_rank) only with non-null MAL values; titles, background, relations untouched; junctions (cover, genres, synonyms) only added when the manga has none | worker | pending |
| T10 | S6 | Manga ranking as bulk catalog refresh (L16): for EXISTING manga the weekly sweep fills null columns and updates volatile MAL stats (status, chapters, volumes, score, scored_by, members, popularity_rank) only with non-null MAL values; titles, background, relations untouched; junctions (cover, genres, synonyms) only added when the manga has none | worker | done (uncommitted) |
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
- **L8** — Independent verify of S6 (8450478): PASS (minimal rows, targeted ON CONFLICT, existing rows untouched, real insert count, anime requests identical after the page/loop split, weekly policy without re-arm loop, derived seeding after listing). Advisories: README request-time claim corrected (no per-page throttle); single-task sweep can approach the 600 s discover deadline if MAL is slow (retries whole).
- **L9** — Defect (parent, local DB, no proxies, `FETCH_TIMEOUT_MS=8000`): the single-task manga sweep hit `Timeout after 20000ms` at offset 44,500, failed whole, discarded ~90 fetched pages and restarted at 0; in production it (and the 4 anime discovery tasks) ended stuck `in_progress`. User, while this was found: "podemos usar los proxies en prod para hidratar ?" (not addressed here). Fix (S6 amendment): pure `runMangaSweep` (per-page save, cursor in payload via `taskRepository.mergeTaskPayload`, per-page retry with backoff, 40 pages/180 s per attempt); unfinished attempt returns a `TaskContinuation` that the GenericManager releases to `pending` (`releaseTasks`, no attempt consumed, not a failure). RED observed: `tests/malMangaSweep.test.ts` missing module; integration fetched all pages in one attempt (`[0, 500]` expected, 6 received). Anime URL test passed before and after the change.
- **L10** — User: "no podemos cambiar la estrategia siento que es muy lento incluso sin proxies ya que las proxies son un free tier de 7 dias asi que para un futuro no nos sirve tener los animes desactualizados por mucho tiempo" → chose "Las 3 partes, en orden". Part 2: `malDiscovery` joins the hot group and the anime discovery task types refresh every 3 h (season + airing/upcoming rankings patch status/episodes/dates of every airing or upcoming anime in ~15 requests); the manga sweep stays weekly. New titles found by a hot drain get their derived tasks at the next daily discover. Part 1 (schedule budgets/cadence) is applied by the maintainer in Dokploy.
- **L11** — Verify of 9ae168e + 8328333: PASS points 1–4 (continuation isolated, cursor resume/reset/merge, anime URLs unchanged, no re-arm loop). FAIL point 5 (B1): DB `task_policy` rows win over code and `db:seed-policy` does not overwrite, so existing 20 h rows keep the old cadence — README now documents the one-time UPDATE to 10800 s. Advisories noted: an attempt that starts before the deadline may overrun it by ~180 s + one page; final Saved line counts the last attempt only.
- **L12** — User chose all 3 parts; part 3 step 1. Probe of `manga/ranking` (limit 2) shows the list endpoint returns main_picture, alternative_titles, start/end_date, synopsis, genres, authors, popularity, num_list_users, mean, num_scoring_users, nsfw; not background, related_manga, serialization (those stay with `malManga`). The ranking now requests those fields and the repository applies the full sheet only to ids its `INSERT … RETURNING` actually inserted; existing manga stay untouched. MAL v2 has no `members` field, so `processMalManga` falls back to `num_list_users` (and `num_scoring_users` → scored_by), which also fixes always-null members on the detail path.
- **L13** — Verify of bc3e43d: PASS 1–5 (only RETURNING ids get the sheet, existing rows untouched, sweep counts/cursor intact, processMalManga differential limited to members/scored_by, anime URLs unchanged, null-tolerant). FAIL 6 (docs): the detail path did not request num_list_users/num_scoring_users — `malManga` MANGA_FIELDS now requests them (probe: detail endpoint returns both); first-load promote list now includes the manga tables the ranking writes; stale comment fixed; reviewer's regression tests added. Advisory kept: INSERT and saveMalManga are separate statements, so a failure between them leaves the row for `malManga` to complete.
- **L14** — Part 3 step 2. Probe: AniList `Page(perPage:50){media(idMal_in:[…], type:MANGA)}` works (ids, countryOfOrigin, status, format, bannerImage returned; `x-ratelimit-limit: 30`). Since T8 already brings the MAL sheet, the AniList pass is scoped to what MAL lacks: the AniList id (needed by AniList cast hydration, which today never reaches new manga because nothing sets it), `country_of_origin` and the banner, fill-only. No status/genre vocabulary mapping.
- **L15** — T9 implemented test-first. Design: single task `anilist_manga_link` (`manga_anilist_link_hydration`, entity `anilistMangaLink`) under `anilist`, priority 25, payload cursor `afterMalId`; seeded by the `anilist` initializer (chained, `ON CONFLICT DO NOTHING`); policy cold/hot 20 h (drained by the hot group; 20 h so a daily tick always finds it due). Pure `runMangaLinkPass` (select 50 unlinked by `mal_id` > cursor, fetch `idMal_in`, write, cursor = last requested id; 40 pages/180 s → `TaskContinuation`; nothing left → cursor 0, complete). Each extra page acquires the process-wide `rateGate` on the same `graphql.anilist.co|ip` key as `anilist`/`anilistMedia`. Writes fill-only: `anilist_id` only where NULL and only if no other manga holds it (no unique constraint exists on `manga_external_ids.anilist_id`, so enforced with `NOT EXISTS`); country/banner only for rows linked in that statement; banner `anilist`/10 only if the manga has no banner. The final save is a no-op processor (service writes per page), so `repositories/anilist.ts` is untouched. `initializeAnilistMediaTasks` already runs on every `--discover` (derived) → new ids get AniList cast tasks at the next discover. RED observed: unit tests failed on missing `services/anilistMangaLinkPass.js` / `config/anilistMangaLink.js`. Results: `bun test` 302 pass / 80 skip / 0 fail; tsc OK; build OK; integration 55/55 (scratch `scraper_link_scratch`, dropped).
- **L16** — User: "podemos acelerar mas ?" → chose "Sí, primero la palanca 1 (Recomendado)": the ~16k manga discovered before T8 entered minimal and the ranking only enriches ids it inserts, so they would wait for ~16k `malManga` detail requests (~45/min). The whole MAL manga catalog is ~150 ranking pages of 500, so the weekly sweep also refreshes existing manga: fill null columns + update volatile stats (status, chapters, volumes, score, scored_by, members, popularity_rank) with non-null MAL values only; titles, background, relations and serialization untouched. Agreed bound: "los campos que cambian solo se pisan con un valor de MAL no vacío; el resto solo se completa donde está vacío; títulos, background y relaciones no se tocan."
- **L17** — T10 implemented test-first (S6, L16). Existing ids on a ranking page (not in the INSERT's `RETURNING`) go through `refreshKnownManga` (`src/repositories/mal/mangaRefresh.ts`, SQL in `mangaRefreshSql.ts`): per 500-manga batch one `UPDATE … FROM (VALUES)` (fill-only `COALESCE(m.col, v.col)` for title_english/title_japanese/synopsis/year/published_from/published_to; `COALESCE(v.col, m.col)` for status/chapters/volumes/score/scored_by/members/popularity_rank; guarded by row `IS DISTINCT FROM` so unchanged rows are not rewritten) and `INSERT … SELECT … WHERE NOT EXISTS` for cover/genres/synonyms (genre catalog upserted as `saveMalManga` does, name rewrite only when it differs). Decision: `type` is never touched — the column is NOT NULL (so "only if NULL" never applies) and `processMalManga` defaults a missing `media_type` to `'manga'`, which would otherwise overwrite e.g. `manhwa`. `inserted` still counts only new rows. Changed T8 assertions (intentional): test 1 known row status `'finished'` → `'x'` (non-null MAL status); L12 test known row chapters/volumes/year null → 40/5/2020 and its cover/genre/synonym counts 0 → 2/1/3. RED: unit missing module `mangaRefreshSql.js`; integration 3 fail (known rows unchanged). GREEN: unit + integration pass on throwaway DB `scraper_t10_scratch` (dropped afterwards).
- **L18** — Parent review of T10: MAL reports 0 chapters/volumes for ongoing series, which under the literal L16 rule would overwrite real DB counts. The refresh now treats 0 as null for chapters/volumes (`NULLIF(v, 0)`), so a stored count is kept when MAL has none. The fresh-insert path (T8) is unchanged.
