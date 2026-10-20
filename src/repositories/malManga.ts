import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { manga, mangaTitleSynonym } from '../schemas/manga.js'
import { mangaExternalIds } from '../schemas/mangaExternal.js'
import {
  mangaGenre,
  mangaTheme,
  mangaDemographic,
  mangaProducer,
  mangaRelation,
} from '../schemas/mangaRelations.js'
import { mangaExternalLink } from '../schemas/externalLink.js'
import { producer, producerTitle } from '../schemas/producer.js'
import { batchUpsert } from '../shared/batchUpsert.js'
import { chunk } from '../utils/chunk.js'
import { unique } from '../utils/deduplicate.js'
import { filterByExistingFk } from '../shared/fkFilter.js'
import type { MalMangaProcessorResult } from '../processors/malManga.js'

/**
 * Guarda la ficha de las obras impresas (manga, novela, one-shot).
 *
 * Orden obligatorio por FK: la obra, las sinónimos, la taxonomía, las
 * empresas, las relaciones, los enlaces y la media. Todo idempotente: la
 * identidad natural de cada junction es su clave primaria compuesta.
 */
export const malMangaRepository = {
  async saveMalManga(results: MalMangaProcessorResult[]): Promise<number> {
    const mangaRows = results.map((r) => r.manga)

    // 1) La obra (upsert: la fila puede haberla creado la enumeración de
    // AniList con menos campos; la ficha de MAL es la que manda).
    for (const batch of chunk(mangaRows, 500)) {
      await db.execute(sql`
        INSERT INTO manga (
          mal_id, type, title, title_english, title_japanese, status, chapters,
          volumes, score, scored_by, popularity_rank, ranking, members, favorites,
          year, synopsis, background, source, serialization,
          duration, published_from, published_to
        )
        SELECT
          v.mal_id, v.type, v.title, v.title_english, v.title_japanese, v.status,
          v.chapters, v.volumes, v.score, v.scored_by, v.popularity_rank, v.ranking,
          v.members, v.favorites, v.year, v.synopsis, v.background, v.source,
          v.serialization, v.duration,
          v.published_from::timestamptz, v.published_to::timestamptz
        FROM (VALUES ${sql.join(
          batch.map(
            (m) =>
              sql`(${m.malId}::int, ${m.type}::text, ${m.title}::text, ${m.titleEnglish}::text, ${m.titleJapanese}::text, ${m.status}::text, ${m.chapters}::int, ${m.volumes}::int, ${m.score}::real, ${m.scoredBy}::int, ${m.popularityRank}::int, ${m.ranking}::int, ${m.members}::int, ${m.favorites}::int, ${m.year}::int, ${m.synopsis}::text, ${m.background}::text, ${m.source}::text, ${m.serialization}::text, ${m.duration}::text, ${m.publishedFrom}::text, ${m.publishedTo}::text)`
          ),
          sql`, `
        )}) AS v(mal_id, type, title, title_english, title_japanese, status,
                 chapters, volumes, score, scored_by, popularity_rank, ranking,
                 members, favorites, year, synopsis, background, source,
                 serialization, duration, published_from, published_to)
        ON CONFLICT (mal_id) DO UPDATE SET
          type = COALESCE(EXCLUDED.type, manga.type),
          title = COALESCE(NULLIF(EXCLUDED.title, ''), manga.title),
          title_english = COALESCE(EXCLUDED.title_english, manga.title_english),
          title_japanese = COALESCE(EXCLUDED.title_japanese, manga.title_japanese),
          status = COALESCE(EXCLUDED.status, manga.status),
          chapters = COALESCE(EXCLUDED.chapters, manga.chapters),
          volumes = COALESCE(EXCLUDED.volumes, manga.volumes),
          score = COALESCE(EXCLUDED.score, manga.score),
          scored_by = COALESCE(EXCLUDED.scored_by, manga.scored_by),
          popularity_rank = COALESCE(EXCLUDED.popularity_rank, manga.popularity_rank),
          ranking = COALESCE(EXCLUDED.ranking, manga.ranking),
          members = COALESCE(EXCLUDED.members, manga.members),
          favorites = COALESCE(EXCLUDED.favorites, manga.favorites),
          year = COALESCE(EXCLUDED.year, manga.year),
          synopsis = COALESCE(EXCLUDED.synopsis, manga.synopsis),
          background = COALESCE(EXCLUDED.background, manga.background),
          source = COALESCE(EXCLUDED.source, manga.source),
          serialization = COALESCE(EXCLUDED.serialization, manga.serialization),
          published_from = COALESCE(manga.published_from, EXCLUDED.published_from),
          published_to = COALESCE(manga.published_to, EXCLUDED.published_to)
      `)
    }

    // 2) Sinónimos.
    const synonyms = unique(
      results.flatMap((r) =>
        r.synonyms.map((s) => ({ mangaId: r.manga.malId, title: s }))
      ),
      (s) => `${s.mangaId}:${s.title}`
    )
    if (synonyms.length > 0) {
      for (const batch of chunk(synonyms, 1_000)) {
        await db.execute(sql`
          INSERT INTO manga_title_synonym (manga_id, title)
          SELECT v.manga_id, v.title
          FROM (VALUES ${sql.join(
            batch.map((s) => sql`(${s.mangaId}::int, ${s.title}::text)`),
            sql`, `
          )}) AS v(manga_id, title)
          ON CONFLICT DO NOTHING
        `)
      }
    }

    // 3) Taxonomía con los ids de MAL. El manga puede traer géneros que
    // ningún anime usó (y por tanto no están en la tabla): se crean aquí con
    // su nombre, que es lo que publica MAL.
    const newGenres = unique(
      results.flatMap((r) =>
        r.genres
          .filter((g) => g.name)
          .map((g) => ({ id: g.genreId, name: g.name as string }))
      ),
      (g) => `${g.id}`
    )
    for (const batch of chunk(newGenres, 500)) {
      await db.execute(sql`
        INSERT INTO genre (mal_id, name)
        SELECT v.id, v.name
        FROM (VALUES ${sql.join(
          batch.map((g) => sql`(${g.id}::int, ${g.name}::text)`),
          sql`, `
        )}) AS v(id, name)
        ON CONFLICT (mal_id) DO UPDATE SET name = EXCLUDED.name
      `)
    }

    const newThemes = unique(
      results.flatMap((r) =>
        r.themes
          .filter((t) => t.name)
          .map((t) => ({ id: t.themeId, name: t.name as string }))
      ),
      (t) => `${t.id}`
    )
    for (const batch of chunk(newThemes, 500)) {
      await db.execute(sql`
        INSERT INTO theme (mal_id, name)
        SELECT v.id, v.name
        FROM (VALUES ${sql.join(
          batch.map((t) => sql`(${t.id}::int, ${t.name}::text)`),
          sql`, `
        )}) AS v(id, name)
        ON CONFLICT (mal_id) DO UPDATE SET name = EXCLUDED.name
      `)
    }

    const newDemographics = unique(
      results.flatMap((r) =>
        r.demographics
          .filter((d) => d.name)
          .map((d) => ({ id: d.demographicId, name: d.name as string }))
      ),
      (d) => `${d.id}`
    )
    for (const batch of chunk(newDemographics, 500)) {
      await db.execute(sql`
        INSERT INTO demographic (mal_id, name)
        SELECT v.id, v.name
        FROM (VALUES ${sql.join(
          batch.map((d) => sql`(${d.id}::int, ${d.name}::text)`),
          sql`, `
        )}) AS v(id, name)
        ON CONFLICT (mal_id) DO UPDATE SET name = EXCLUDED.name
      `)
    }

    await batchUpsert(
      mangaGenre,
      unique(
        results.flatMap((r) => r.genres),
        (g) => `${g.mangaId}:${g.genreId}`
      ).map((g) => ({ mangaId: g.mangaId, genreId: g.genreId })),
      2,
      'manga-genre'
    )
    await batchUpsert(
      mangaTheme,
      unique(
        results.flatMap((r) => r.themes),
        (t) => `${t.mangaId}:${t.themeId}`
      ).map((t) => ({ mangaId: t.mangaId, themeId: t.themeId })),
      2,
      'manga-theme'
    )
    await batchUpsert(
      mangaDemographic,
      unique(
        results.flatMap((r) => r.demographics),
        (d) => `${d.mangaId}:${d.demographicId}`
      ).map((d) => ({ mangaId: d.mangaId, demographicId: d.demographicId })),
      2,
      'manga-demographic'
    )

    // 4) Empresas (editorial) con su rol.
    const companies = unique(
      results.flatMap((r) => r.producers),
      (p) => `${p.mangaId}:${p.producerId}:${p.role}`
    )
    if (companies.length > 0) {
      const producerIds = unique(companies, (p) => `${p.producerId}`)
      await batchUpsert(
        producer,
        producerIds.map((p) => ({ malId: p.producerId })),
        1,
        'producer'
      )
      const titles = companies.filter((c) => c.name)
      await batchUpsert(
        producerTitle,
        unique(
          titles.map((c) => ({
            producerId: c.producerId,
            // `type` es NOT NULL en el DDL: el catálogo de MAL no distingue
            // tipos de título, así que se usa el mismo valor que el scrapeo
            // del anime ("Default").
            type: 'Default',
            title: c.name as string,
          })),
          (t) => `${t.producerId}:${t.title}`
        ),
        3,
        'producer-title'
      )
      await batchUpsert(
        mangaProducer,
        companies.map((c) => ({
          mangaId: c.mangaId,
          producerId: c.producerId,
          role: c.role,
        })),
        3,
        'manga-producer'
      )
    }

    // 5) Relaciones (la obra relacionada debe existir en el catálogo).
    const relations = unique(
      results.flatMap((r) => r.relations),
      (r) => `${r.mangaId}:${r.relatedMangaId}:${r.relationType}`
    )
    const validRelations = await filterByExistingFk(
      relations,
      (r) => r.relatedMangaId,
      manga,
      manga.malId,
      false
    )
    await batchUpsert(
      mangaRelation,
      validRelations.map((r) => ({
        mangaId: r.mangaId,
        relatedMangaId: r.relatedMangaId,
        relationType: r.relationType,
      })),
      3,
      'manga-relation'
    )

    // 6) Enlaces externos.
    const links = unique(
      results.flatMap((r) => r.externalLinks),
      (l) => `${l.mangaId}:${l.url}`
    )
    for (const batch of chunk(links, 500)) {
      await db.execute(sql`
        INSERT INTO manga_external_link (manga_id, site, url, type)
        SELECT v.manga_id, v.site, v.url, v.type
        FROM (VALUES ${sql.join(
          batch.map(
            (l) =>
              sql`(${l.mangaId}::int, ${l.site}::text, ${l.url}::text, ${l.type}::text)`
          ),
          sql`, `
        )}) AS v(manga_id, site, url, type)
        ON CONFLICT (manga_id, url) DO UPDATE SET
          site = EXCLUDED.site, type = EXCLUDED.type
      `)
    }

    // 7) Portadas.
    const media = unique(
      results.flatMap((r) => r.media),
      (m) => `${m.mangaId}:${m.src}`
    )
    for (const batch of chunk(media, 500)) {
      await db.execute(sql`
        INSERT INTO manga_media (manga_id, media_type, src, size, source, priority)
        SELECT v.manga_id, v.media_type, v.src, v.size, 'mal', 20
        FROM (VALUES ${sql.join(
          batch.map(
            (m) =>
              sql`(${m.mangaId}::int, ${m.mediaType}::text, ${m.src}::text, ${m.size}::text)`
          ),
          sql`, `
        )}) AS v(manga_id, media_type, src, size)
        ON CONFLICT (manga_id, media_type, src) DO NOTHING
      `)
    }

    // 8) Ids externos: la ficha de MAL confirma que la obra es la misma.
    for (const batch of chunk(mangaRows, 500)) {
      await db.execute(sql`
        INSERT INTO manga_external_ids (manga_id, created_at, updated_at)
        SELECT v.mal_id, now(), now()
        FROM (VALUES ${sql.join(
          batch.map((m) => sql`(${m.malId}::int)`),
          sql`, `
        )}) AS v(mal_id)
        ON CONFLICT (manga_id) DO UPDATE SET updated_at = now()
      `)
    }

    return mangaRows.length
  },
}
