# manga-mal-characters

Ingest manga casts from MAL's characters page with real MAL character ids, so
the ~53k of 70,859 manga without a cast (today `manga_character` only comes
from AniList, name-matched) get their characters.
Branch: `feat/manga-mal-characters` (base `main` 75f86c5). Conventions and the
role/name/external-id rules follow `odd/tasks/cast-hydration.md` (S3, S4, S8).

## Specs

- **S1** New task type `manga_mal_characters_hydration` that fetches
  `https://myanimelist.net/manga/{id}/_/characters` through the same MAL HTML
  fetch path, proxies and rate limiting as the anime characters task
  (`anime_mal_characters_hydration`). It lives in its own source
  `malMangaCharacters` (same worker/batch/rate config as `malCharacters`) so it
  can be drained alone (S6).
- **S2** Parse with the existing characters-page parser
  (`src/shared/malCharactersHtml.ts`), generalized by media (anime/manga table
  and favourites selectors: `js-anime-character-table` /
  `js-manga-character-table`, `js-anime-character-favorites` /
  `js-manga-character-favorites`) — no duplicated parser. The anime behavior
  stays byte-identical (regression test with an anime fixture).
- **S3** Write `character` (name; no romaji into `name_kanji` — reuse the
  `nativeNameOrNull` rules), `character_media` (MAL portrait, same
  source/priority as the anime MAL characters writer: `poster`, size NULL,
  source `mal`, priority 20; skip MAL `questionmark` placeholders),
  `character_external` (`mal_id`, via `characterExternalMalSql`), and
  `manga_character (manga_id, character_id, role)` with roles
  Main/Supporting/Background, `ON CONFLICT DO NOTHING`. Never delete
  AniList-sourced rows; never match by name (MAL gives real ids).
- **S4** Seeding: create tasks for every manga in `manga` without a task of
  this type (idempotent, `ON CONFLICT DO NOTHING`), slow group. REFRESH_POLICY:
  cold 180 days, hot null (manga are not airing-sensitive, so the anime
  `cold null / hot 180 d` would never refresh a manga cast; cold 180 d lets
  casts of ongoing manga grow). Budget/cap identical to the anime characters
  task (per-source budget of the slow group, 150/tick).
- **S5** `incremental:report` (and `/stats`) shows the new task type's queue
  state like the others.
- **S6** (parent, L2) The initial load is feasible as a one-off: a drain of only
  this task type with a larger budget and deadline, respecting the source rate
  limit (no faster than the anime MAL characters source), documented with its
  exact command and expected duration.

## Tasks

| ID | Specs | Task | Route | Commit |
|----|-------|------|-------|--------|
| T1 | S2 | Parser generalized by media + manga/anime fixtures + regression test | worker | — (uncommitted) ✅ |
| T2 | S1, S3 | Source `malMangaCharacters`: service, processor, repository (SQL builders) | worker | — (uncommitted) ✅ |
| T3 | S4, S5, S6 | Seeder, policy, slow group, report view, one-off drain docs | worker | — (uncommitted) ✅ |
| T4 | S1–S6 | Verify: `bun test`, `bunx tsc -p tsconfig.test.json`, `bun run build`, integration on a throwaway DB | worker | — (uncommitted) ✅ |

## One-off initial load (S6)

The slow group drains 150 tasks per source every 6 h (≈600 manga/day ⇒ ~118
days for 70,859 manga). For the initial load, after seeding:

```bash
bun run malMangaCharacters:seed-tasks   # one task per manga (idempotent)
bun run db:seed-policy                  # adds the policy row (never overwrites edits)
bun src/scripts/incremental.ts --drain --sources=malMangaCharacters --budget=80000 --deadline=86400
```

`--sources=malMangaCharacters` drains only this task type (its own source and
advisory lock); the rate gate keeps the source quota of 1 req/s, 60/min per IP
(same as `malCharacters`). Single IP: 70,859 / 60 per min ≈ 1,181 min ≈ 20 h,
so `--deadline=86400` (24 h) covers it; whatever is left (failures, retries)
stays `pending` for the next slow tick or a re-run of the same command. With
proxies the gate is per IP and it goes faster, still capped per IP.

## Log

- **L1** (user request): "ok y no se puede hacer la ingesta desde mal ?"
- **L2** — Parent: slow group = 6 h × 150/source ≈ 600 manga/day ⇒ ~118 days;
  make the initial load feasible as a one-off drain of only this task type with
  a larger budget, respecting the source rate limit (S6). README is outside the
  edit surfaces: the parent adds the README text.
- **L3** — Design: own source `malMangaCharacters` (instead of a task-type
  filter in the shared claim) so `--sources=` already drains only manga casts and
  the anime cast queue keeps its own budget. Host in `SOURCE_HOSTS` is the real
  `myanimelist.net` (the anime source declares `api.myanimelist.net` but fetches
  the web), same limits 1/s, 60/min. The anime writer still stores MAL
  `questionmark` portraits for characters (pre-existing, unchanged here).
- **L4** — Fixtures: one capture each of `/manga/35243/_/characters` (Haikyuu!!,
  250 rows) and `/anime/1/_/characters` (Cowboy Bebop), trimmed to 4 and 3
  rows; the anime golden output (`mal-anime-characters.parsed.json`) was
  produced by the parser *before* the change. RED: unit file failed (missing
  module) and the report test expected 5 views; GREEN after implementation.
  Integration on a throwaway DB (`scraper_manga_scratch`, migrations + pg_trgm +
  `db:ingest-schema`, dropped afterwards): `test:integration` 44 pass, 0 fail.
  `bun test`, `bunx tsc -p tsconfig.test.json`, `bun run build` pass.
- **L5** — Independent verify: PASS S1–S6 (anime writer SQL byte-identical to main; no re-arm loop; 44 integration tests). Advisories recorded: pause `incremental:slow` during the one-off drain (per-process rate gate shares the IP); MAL rows can duplicate an AniList-only synthetic character of the same manga (by design, no name matching) — unify locally before promoting; saver count includes links skipped for missing manga.
