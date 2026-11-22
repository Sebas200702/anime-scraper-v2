import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import {
  HOT_ANIME_IDS_SQL,
  INCONSISTENT_ANIME_WHERE,
  SELECTED_ANIME_WHERE,
} from '../src/repositories/tasks/animeSets.js'
import {
  EPISODE_KINDS,
  episodeKindsFor,
  hotTaskTypes,
  rearmHotSql,
  refreshEpisodePayloadSql,
  seedEpisodeTasksSql,
} from '../src/repositories/tasks/hotRearmSql.js'

const dialect = new PgDialect()
const render = (query: SQL) => {
  const out = dialect.sqlToQuery(query)
  return { sql: out.sql.replace(/\s+/g, ' ').trim(), params: out.params }
}

const TYPES = [
  { taskType: 'anime_mal_details_hydration', hotSeconds: 86400 },
  { taskType: 'anime_episodes_hydration', hotSeconds: 86400 },
]

describe('hotTaskTypes (S9: tipos con cadencia hot)', () => {
  test('incluye los tipos con hot no nulo y excluye los que no son sensibles a emisión', () => {
    const types = Object.fromEntries(
      hotTaskTypes().map((t) => [t.taskType, t.hotSeconds])
    )
    expect(types.anime_mal_details_hydration).toBe(24 * 3600)
    expect(types.anime_episodes_hydration).toBe(24 * 3600)
    expect(types.tvdb_episodes_hydration).toBe(24 * 3600)
    expect(types.anime_mal_html_hydration).toBe(90 * 86400)
    expect(types.anime_themes_hydration).toBeUndefined()
    expect(types.anime_details_hydration).toBeUndefined()
  })

  test('acepta una política explícita', () => {
    expect(
      hotTaskTypes({ a: { cold: null, hot: 60 }, b: { cold: 5, hot: null } })
    ).toEqual([{ taskType: 'a', hotSeconds: 60 }])
  })
})

describe('anime hot ∪ inconsistente (S9)', () => {
  test('inconsistente: airing ya terminado hace > 7 días y "Not yet aired" ya empezado', () => {
    const where = render(INCONSISTENT_ANIME_WHERE).sql
    expect(where).toContain(
      "status = 'Currently Airing' AND aired_to IS NOT NULL AND aired_to < now() - interval '7 days'"
    )
    expect(where).toContain(
      "status = 'Not yet aired' AND aired_from IS NOT NULL AND aired_from <= now()"
    )
  })

  test('la selección une hot (con ventana de cierre de 14 días) e inconsistente', () => {
    const where = render(SELECTED_ANIME_WHERE).sql
    expect(where).toContain("status = 'Currently Airing'")
    expect(where).toContain("aired_from <= now() + interval '30 days'")
    expect(where).toContain("aired_to >= now() - interval '14 days'")
    expect(where).toContain(render(INCONSISTENT_ANIME_WHERE).sql)
  })

  test('el hot set de la completitud es el mismo conjunto (si no, re-armaría en bucle)', () => {
    expect(render(HOT_ANIME_IDS_SQL).sql).toContain(
      render(SELECTED_ANIME_WHERE).sql
    )
  })
})

describe('rearmHotSql (S9: re-armado de tareas hot)', () => {
  const q = render(rearmHotSql({ types: TYPES, limit: 300, backoffHours: 6 }))

  test('re-arma completed con refresh_after NULL, vencido o más lejano que el intervalo hot', () => {
    expect(q.sql).toContain(
      "t.status = 'completed' AND (t.refresh_after IS NULL OR t.refresh_after <= now() OR t.refresh_after > now() + p.hot_seconds * interval '1 second')"
    )
  })

  test('revive dead_letter/skipped con backoff y deja pending, prioridad 20, attempts 0', () => {
    expect(q.sql).toContain(
      "t.status IN ('dead_letter', 'skipped') AND t.updated_at < now() - "
    )
    expect(q.sql).toContain(
      "SET status = 'pending', scheduled_at = now(), priority = 20, attempts = 0, leased_until = NULL, updated_at = now()"
    )
    expect(q.params).toContain(6)
  })

  test('nunca toca in_progress y, al dejar pending, una segunda pasada no vuelve a elegirla', () => {
    expect(q.sql).toContain("AND t.status <> 'in_progress'")
    expect(q.sql).not.toMatch(/t\.status IN \([^)]*'(pending|in_progress)'/)
    expect(q.sql).not.toContain("t.status = 'pending'")
  })

  test('cruza la política de la DB (manda) con la del código y el anime seleccionado', () => {
    expect(q.sql).toContain('LEFT JOIN ingest.task_policy tp')
    expect(q.sql).toContain(
      'CASE WHEN tp.source IS NULL THEN c.hot_seconds ELSE tp.refresh_interval_airing_seconds END'
    )
    expect(q.sql).toContain(render(SELECTED_ANIME_WHERE).sql)
    expect(q.params).toEqual(
      expect.arrayContaining(['anime_mal_details_hydration', 86400, 300])
    )
    expect(q.sql).toContain('FOR UPDATE OF t SKIP LOCKED')
  })

  test('pasada final de cierre: tipos con intervalo hot > 14 días, scrapeados antes de aired_to', () => {
    expect(q.sql).toContain(
      `OR (t.status = 'completed' AND p.hot_seconds > ${14 * 86400} AND EXISTS (SELECT 1 FROM anime a WHERE a.mal_id = `
    )
    expect(q.sql).toContain(
      "AND a.aired_to IS NOT NULL AND a.aired_to <= now() AND a.aired_to >= now() - interval '14 days' AND (t.last_scraped_at IS NULL OR t.last_scraped_at < a.aired_to))"
    )
  })

  test('filtra por fuente solo cuando se pide', () => {
    expect(q.sql).not.toContain('t.source =')
    const scoped = render(
      rearmHotSql({ source: 'mal', types: TYPES, limit: 10, backoffHours: 6 })
    )
    expect(scoped.sql).toContain('AND t.source = $')
    expect(scoped.params).toContain('mal')
  })
})

describe('payload y siembra de episodios (S9)', () => {
  test('refresca kitsu_id / tvdbId desde anime_external_ids, solo si cambió', () => {
    const kitsu = render(refreshEpisodePayloadSql(EPISODE_KINDS.animeEpisodes))
    expect(kitsu.sql).toContain(
      "jsonb_set(coalesce(t.payload, '{}'::jsonb), '{kitsu_id}', to_jsonb(x.kitsu_id))"
    )
    expect(kitsu.sql).toContain(
      "(t.payload->>'kitsu_id') IS DISTINCT FROM x.kitsu_id::text"
    )
    expect(kitsu.sql).toContain("t.status <> 'in_progress'")
    expect(kitsu.sql).toContain('attempts = 0')

    const tvdb = render(refreshEpisodePayloadSql(EPISODE_KINDS.tvdbEpisodes))
    expect(tvdb.sql).toContain("'{tvdbId}', to_jsonb(x.tvdb_id)")
    expect(tvdb.sql).toContain("t.source = 'tvdbEpisodes'")
    expect(tvdb.sql).toContain(render(SELECTED_ANIME_WHERE).sql)
  })

  test('siembra la tarea que falta para anime hot con fila de ids externos', () => {
    const seed = render(seedEpisodeTasksSql(EPISODE_KINDS.animeEpisodes))
    expect(seed.sql).toContain('INSERT INTO ingest.task')
    expect(seed.sql).toContain("'anime_episodes_' || x.anime_id")
    expect(seed.sql).toContain(
      "jsonb_build_object('kitsu_id', x.kitsu_id, 'anime_id', x.anime_id)"
    )
    expect(seed.sql).toContain('x.kitsu_id IS NOT NULL')
    expect(seed.sql).toContain('NOT EXISTS')
    expect(seed.sql).toContain('ON CONFLICT (source, task_type, entity_id) DO NOTHING')

    const tvdb = render(seedEpisodeTasksSql(EPISODE_KINDS.tvdbEpisodes))
    expect(tvdb.sql).toContain("'tvdb_eps_' || x.tvdb_id")
    expect(tvdb.sql).toContain("'tvdb_episodes_hydration'")
  })

  test('los pasos de episodios corren solo en su fuente (o en todas sin filtro)', () => {
    expect(episodeKindsFor('mal')).toEqual([])
    expect(episodeKindsFor('animeEpisodes')).toEqual([EPISODE_KINDS.animeEpisodes])
    expect(episodeKindsFor(undefined)).toHaveLength(2)
  })
})
