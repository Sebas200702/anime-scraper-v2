import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { processMalDiscoveryMangaRanking } from '../src/processors/malDiscovery.js'
import {
  addMissingCoversSql,
  addMissingGenresSql,
  addMissingSynonymsSql,
  refreshKnownMangaSql,
  upsertGenresSql,
} from '../src/repositories/mal/mangaRefreshSql.js'
import type { ScrapingTask } from '../src/types/index.js'

/**
 * T10 (S6, L16): el barrido semanal refresca los manga EXISTENTES. Columnas
 * de solo-relleno donde la DB está en NULL; estadísticas volátiles solo con un
 * valor de MAL no nulo; títulos, background, fuente, serialización, ranking y
 * favoritos nunca. Las junctions solo se añaden si el manga no tiene ninguna
 * de ese tipo. SQL por conjuntos (VALUES), sin consultas por fila.
 */
const dialect = new PgDialect()
const flat = (q: { sql: string }) => q.sql.replace(/\s+/g, ' ')
const { details } = processMalDiscoveryMangaRanking(
  {
    nodes: [
      {
        id: 181001,
        title: 'Conocido',
        alternative_titles: { en: 'Known', ja: '既知', synonyms: ['K'] },
        main_picture: { medium: 'https://c/m.jpg', large: 'https://c/l.jpg' },
        start_date: '2001-02-03',
        synopsis: 'S',
        media_type: 'manhwa',
        status: 'finished',
        genres: [{ id: 1, name: 'Action' }],
        num_chapters: 10,
        num_volumes: 2,
        popularity: 30,
        num_list_users: 400,
        mean: 7.25,
        num_scoring_users: 50,
      },
    ],
  },
  { entityId: 'mal_discovery_manga_ranking_bypopularity' } as ScrapingTask
)
const sheet = details[0] as (typeof details)[number]

describe('T10 · refresco de manga existentes (SQL)', () => {
  test('UPDATE por conjuntos: relleno donde es NULL, stats solo con MAL no nulo', () => {
    const query = dialect.sqlToQuery(refreshKnownMangaSql([sheet.manga]))
    const text = flat(query)
    expect(text).toContain('UPDATE manga AS m SET')
    expect(text).toContain('FROM (VALUES')
    for (const col of [
      'title_english',
      'title_japanese',
      'synopsis',
      'year',
      'published_from',
      'published_to',
    ])
      expect(text).toContain(`${col} = COALESCE(m.${col}, v.${col})`)
    for (const col of [
      'status',
      'chapters',
      'volumes',
      'score',
      'scored_by',
      'members',
      'popularity_rank',
    ])
      expect(text).toContain(`${col} = COALESCE(v.${col}, m.${col})`)
    // Nunca se tocan (L16): ni el título ni lo que el endpoint de listas no
    // publica; `type` es NOT NULL, así que "solo si es NULL" no aplica nunca.
    const set = text.slice(text.indexOf(' SET '), text.indexOf(' FROM ('))
    for (const col of [
      'title',
      'type',
      'background',
      'source',
      'serialization',
      'ranking',
      'favorites',
    ])
      expect(set).not.toMatch(new RegExp(`[ ,]${col} =`))
    // Idempotente sin reescribir: solo filas donde algo cambia de verdad.
    expect(text).toContain('IS DISTINCT FROM')
    expect(query.params).toEqual([
      181001,
      'Known',
      '既知',
      'S',
      2001,
      '2001-02-03T00:00:00.000Z',
      null,
      'finished',
      10,
      2,
      7.25,
      50,
      400,
      30,
    ])
  })

  test('capítulos/volúmenes en 0 (serie en curso en MAL) no pisan el valor', () => {
    const query = dialect.sqlToQuery(refreshKnownMangaSql([sheet.manga]))
    expect(query.sql).toContain('NULLIF($9::int, 0)')
    expect(query.sql).toContain('NULLIF($10::int, 0)')
  })

  test('portada solo si el manga no tiene ninguna (todas las tallas a la vez)', () => {
    const query = dialect.sqlToQuery(addMissingCoversSql(sheet.media))
    const text = flat(query)
    expect(text).toContain(
      'INSERT INTO manga_media (manga_id, media_type, src, size, source, priority)'
    )
    expect(text).toMatch(
      /NOT EXISTS \( SELECT 1 FROM manga_media e WHERE e\.manga_id = v\.manga_id AND e\.media_type = v\.media_type \)/
    )
    expect(text).toContain('JOIN manga m ON m.mal_id = v.manga_id')
    expect(text).toContain('ON CONFLICT (manga_id, media_type, src) DO NOTHING')
    expect(query.params).toEqual([
      181001,
      'cover',
      'https://c/l.jpg',
      'large',
      181001,
      'cover',
      'https://c/m.jpg',
      'medium',
    ])
  })

  test('géneros: el catálogo se crea como saveMalManga, la junction solo si no hay', () => {
    const genres = dialect.sqlToQuery(upsertGenresSql(sheet.genres))
    expect(flat(genres)).toContain(
      'ON CONFLICT (mal_id) DO UPDATE SET name = EXCLUDED.name WHERE genre.name IS DISTINCT FROM EXCLUDED.name'
    )
    expect(genres.params).toEqual([1, 'Action'])

    const links = dialect.sqlToQuery(addMissingGenresSql(sheet.genres))
    const text = flat(links)
    expect(text).toContain('INSERT INTO manga_genre (manga_id, genre_id)')
    expect(text).toMatch(
      /NOT EXISTS \( SELECT 1 FROM manga_genre e WHERE e\.manga_id = v\.manga_id \)/
    )
    expect(text).toContain('JOIN genre g ON g.mal_id = v.genre_id')
    expect(text).toContain('ON CONFLICT DO NOTHING')
    expect(links.params).toEqual([181001, 1])
  })

  test('sinónimos solo si el manga no tiene ninguno', () => {
    const query = dialect.sqlToQuery(
      addMissingSynonymsSql(
        sheet.synonyms.map((title) => ({ mangaId: 181001, title }))
      )
    )
    const text = flat(query)
    expect(text).toContain('INSERT INTO manga_title_synonym (manga_id, title)')
    expect(text).toMatch(
      /NOT EXISTS \( SELECT 1 FROM manga_title_synonym e WHERE e\.manga_id = v\.manga_id \)/
    )
    expect(text).toContain('ON CONFLICT DO NOTHING')
    expect(query.params).toEqual([181001, 'Known', 181001, '既知', 181001, 'K'])
  })

  test('ninguna sentencia borra', () => {
    for (const q of [
      refreshKnownMangaSql([sheet.manga]),
      addMissingCoversSql(sheet.media),
      upsertGenresSql(sheet.genres),
      addMissingGenresSql(sheet.genres),
      addMissingSynonymsSql([{ mangaId: 181001, title: 'K' }]),
    ])
      expect(flat(dialect.sqlToQuery(q))).not.toMatch(/DELETE|TRUNCATE/i)
  })
})
