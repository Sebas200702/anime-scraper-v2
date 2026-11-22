# cast-hydration

Fix continuous anime/manga hydration so AniList and MAL casts converge on the
right characters, with real external ids, one role vocabulary and fill-only patches.
Branch: `fix/cast-hydration` (base `main`). Promotion target: prod via `promote`.

## Specs

- **S1** Characters from AniList are matched to existing characters only inside
  the cast of the same anime/manga: first by `character_external.anilist_id`,
  then by normalized name (comma inversion "Last, First"↔"First Last",
  lowercase, punctuation stripped, macrons → plain vowel, long vowels
  collapsed: ou/oo→o, uu→u, aa→a, ee→e, ii→i). Never a global lookup (today:
  `src/repositories/anilistMedia.ts:66-100,188-193` builds a whole-table name
  index — "Narrator" got linked to 1,245 anime).
- **S2** Unmatched AniList characters keep the id policy `1000000000 + AniList
  id` as their internal key, and their real ids are written to
  `character_external` (character_id, mal_id NULL, anilist_id, created_at,
  updated_at — NOT NULL, no DB default). Matched characters get
  `character_external.anilist_id` only when free (partial unique). No global
  `character.anilist_id` UPDATE.
- **S3** Cast roles use one vocabulary: Main / Supporting / Background (MAL
  form), never UPPERCASE.
- **S4** `name_kanji` only receives a non-ASCII native name; the MAL
  characters-page parser must not store the romaji from
  `div.js-chara-roll-and-name` as native.
- **S5** AniList character portraits are written to `character_media`:
  media_type 'poster', size NULL, source 'anilist', priority 30, skipping
  AniList `/default.jpg|png` placeholders, never replacing existing rows.
- **S6** The AniList deep pass attaches a cast to the task's anime/manga id and
  skips (logs) when AniList's idMal disagrees; relation types are mapped to the
  stored MAL vocabulary instead of collapsing to 'other' (ALTERNATIVE →
  'Alternative setting'; SEQUEL→Sequel, PREQUEL→Prequel, SIDE_STORY→Side story,
  PARENT→Parent story, SPIN_OFF→Spin-off, SUMMARY→Summary,
  CHARACTER→Character, ADAPTATION→Adaptation, SOURCE→Adaptation only if that is
  how the stored vocabulary does it — check stored values via the mirrored
  schema/docs, otherwise keep 'Other').
- **S7** The AniList banner/patch writer only fills empty anime fields; it never
  overwrites a value another source (MAL) already wrote.
- **S8** MAL writers record `character_external.mal_id` for the characters they
  write.

- **S9** — Continuous hydration must keep airing state current. Evidence (local clone of prod, 2026-11-22): 49 anime "Currently Airing" whose `aired_to` passed more than 14 days ago (e.g. MILGЯAM ended 2021); 47 "Not yet aired" already started (5 already ended); 237 of 349 airing anime have no dated episode; `anime_external_ids.updated_at` stops at 2026-10-20. Suspected cause: the season sweep only re-arms anime that finished in the last 14 days, so stale statuses are never revisited. User: "si vamos hacer es correcion tambien".

## Tasks

| ID | Specs | Task | Route | Commit |
|----|-------|------|-------|--------|
| T1 | S2 | Mirror `character_external` schema + PROMOTION_PLAN entry | worker | 3a25c02 ✅ |
| T2 | S1 | Character name normalizer helper + tests | worker | ecc48f3 ✅ |
| T3 | S1, S2, S3, S5, S6 | AniList deep pass | worker | dc2380e ✅ |
| T4 | S4, S7, S8 | MAL writers + AniList patch fill-only | worker | 2f68013 ✅ |
| T6 | S9 | Hydration scheduling: re-arm stale airing / not-yet-aired anime, episodes for airing anime, staleness report | explore → worker | 64ea95d ✅ |
| T5 | — | Verify (`bun test`, `bun run build`) | worker | 6304b16 ✅ |

## Log

- **L1** (user request): "bueno vamos a promover esto a produccin y vamos a
  ajustar el scraper para que la hidratacion continua de los animes funcione
  correctamente"
- **L2** — User asked "pregunta la hidratacion actual si funciona si mantiene la info actualizada ?"; measured staleness (S9) and proposed T6; user: "si vamos hacer es correcion tambien".
- **L3** — T3 done. Relation vocabularies were already mixed in the app DB (anime_relation: `Sequel` and `sequel`; manga_relation: `SEQUEL` and `sequel`). The deep pass now writes the MAL form per media: anime `Side story`, manga `SIDE_STORY` (parent change, test-first). Voice actors/staff are still matched by global staff name (out of scope, noted). Old `character.anilist_id` values written by the global matcher stay until the data promotion.
- **L4** — T6 cause (explore, path:line): (1) main — the refresh interval is chosen once, when a task completes (`refreshSecondsForTask`, src/core/genericManager.ts:177-188); `anime_mal_details_hydration`, `anime_episodes_hydration`, `tvdb_episodes_hydration` have `cold: null` (src/config/sources.ts:380-399), so a task completed while the anime was cold gets `refresh_after = NULL` forever; `rearmDueTasks` ignores NULL rows (src/repositories/tasks.ts:224-232). (2) The hot set (tasks.ts:457-468) ignores "Not yet aired" more than 30 days out at completion time. (3) Re-armed hot tasks keep priority 15 and can starve behind the pending backlog (150/source/tick). (4) The season sweep runs only with `--discover`, only for `aired_to` within 14 days, only completed tasks, not tvdbEpisodes (src/scripts/incremental.ts:183-210). (5) Episode task payloads freeze `kitsu_id`/`tvdbId` at seed time; null → skipped forever unless a manual repair script runs (tasks.ts:303-358). (6) dead_letter is permanent unless the error matches the transient regex (only in `--discover`). (7) No status is derived from dates; only a fresh MAL fetch changes it. Diagnostic queries A–D for production are in the T6 report.
- **L5** — T6 done: re-arm of hot/inconsistent anime on every drain (cap `INCREMENTAL_HOT_REARM_LIMIT`, default 300; suggested 150 at first), DB task policy wins over code policy, dead_letter/skipped revived after 6 h, episode payload ids refreshed, missing episode tasks seeded, season sweep removed, `bun run incremental:report` (read-only A–D views). Hot window after `aired_to` unified to 14 days for completion and re-arm (avoids re-arm loops); `normalizeRefresh.ts` keeps its old 7-day copy. Generated SQL tested as text only; DB execution pending in T5.
- **L6** — T5 against a throwaway Postgres (scraper_t5_scratch, dropped afterwards): repo migrations + new 0010_character-external (clean: only that table) applied after `CREATE EXTENSION pg_trgm` (existing migrations assume it). 15 new integration tests pass (S1–S9); defect found and fixed: staleness view B "column reference status is ambiguous" (RED→GREEN). Pre-existing failure on main, not touched: tests/incremental.integration.test.ts:57-59 expects anime_details_hydration hot=86400, but main (37a2bd8) set it to null. `bun test` 231 pass; build OK. New integration files added to `test:integration`.
- **L7** — Independent verify (Risk item 1): PASS S1–S3, S5–S9; S4 FAIL (low): `src/processors/jikan/characterMapper.ts:10` → `repositories/jikan.ts:100` writes name_kanji unguarded (legacy Jikan path, still registered). Advisories to fix before PR: (1) removing seasonSweep lost the final `anime_mal_html_hydration` cast refresh for anime finished in the last 14 days (90-day hot interval keeps them un-rearmed); (2) one-to-one matching not enforced — two AniList "Guard"s can both take MAL 980510 and the result flips between runs; (5) `normalizeRefresh.ts` still uses a 7-day window; (6) AniList deep-pass relations keep null node types and self-relations. Accepted as-is (documented): concurrent character_external UPDATE can hit the unique index → task retries; promotion upsert by character_id can conflict with prod external ids held by another character; dead_letter for hot anime retried every 6 h.
