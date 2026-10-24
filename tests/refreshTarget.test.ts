import { describe, expect, test } from 'bun:test'
import { animeIdForTask } from '../src/shared/refreshTarget.js'

const task = (entityId: string, payload: Record<string, unknown> = {}) => ({
  entityId,
  payload,
})

describe('animeIdForTask (hot set del Modo B)', () => {
  test('usa el payload cuando existe (animeId o anime_id)', () => {
    expect(animeIdForTask(task('anime_details_5114', { animeId: 5114 }))).toBe(
      5114
    )
    expect(
      animeIdForTask(task('anime_episodes_21', { anime_id: 21, kitsu_id: 7 }))
    ).toBe(21)
    // El payload manda aunque el entity_id diga otra cosa (mapping reparado).
    expect(animeIdForTask(task('anime_details_1', { animeId: 999 }))).toBe(999)
  })

  test('cae al entity_id cuando el payload no trae el id', () => {
    expect(animeIdForTask(task('anime_details_5114'))).toBe(5114)
    expect(animeIdForTask(task('anime_banner_30'))).toBe(30)
    expect(animeIdForTask(task('mal_details_16498'))).toBe(16498)
    expect(animeIdForTask(task('tvdb_artworks_123'))).toBe(123)
  })

  test('no inventa un anime para tareas globales/personas/manga', () => {
    expect(animeIdForTask(task('mal_ranking_all'))).toBeUndefined()
    expect(
      animeIdForTask(task('person_123', { personId: 123 }))
    ).toBeUndefined()
    expect(animeIdForTask(task('music_99', { musicId: 99 }))).toBeUndefined()
    expect(animeIdForTask(task('manga_5', { mangaId: 5 }))).toBeUndefined()
    expect(animeIdForTask(task('algo-raro'))).toBeUndefined()
    expect(animeIdForTask(task('anime_details_abc'))).toBeUndefined()
  })

  test('ignora ids inválidos (0, negativos, NaN)', () => {
    expect(animeIdForTask(task('x', { animeId: 0 }))).toBeUndefined()
    expect(animeIdForTask(task('x', { animeId: -4 }))).toBeUndefined()
    expect(animeIdForTask(task('x', { animeId: 'abc' }))).toBeUndefined()
  })
})
