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

## Tasks

| ID | Specs | Task | Route | Commit |
|----|-------|------|-------|--------|
| T1 | S2 | Mirror `character_external` schema + PROMOTION_PLAN entry | worker | |
| T2 | S1 | Character name normalizer helper + tests | worker | |
| T3 | S1, S2, S3, S5, S6 | AniList deep pass | worker | |
| T4 | S4, S7, S8 | MAL writers + AniList patch fill-only | worker | |
| T5 | — | Verify (`bun test`, `bun run build`) | worker | |

## Log

- **L1** (user request): "bueno vamos a promover esto a produccin y vamos a
  ajustar el scraper para que la hidratacion continua de los animes funcione
  correctamente"
