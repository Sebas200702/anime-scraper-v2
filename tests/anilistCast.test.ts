import { describe, expect, test } from 'bun:test'
import {
  ANILIST_ONLY_ID_BASE,
  isRealAnilistImage,
  mapCastRole,
  mapRelationType,
  matchCastCharacter,
  planCharacterExternal,
  resolveCastMediaId,
  type CastMember,
} from '../src/utils/anilistCast.js'

const cast: CastMember[] = [
  { characterId: 10, name: 'Doujima, Kengo', anilistId: null },
  { characterId: 11, name: 'Narrator', anilistId: null },
  { characterId: 12, name: 'Black, Jet', anilistId: 555 },
]

describe('matchCastCharacter (S1: solo dentro del reparto del mismo medio)', () => {
  test('anilist_id primero, aunque el nombre no coincida', () => {
    expect(
      matchCastCharacter({ anilistId: 555, name: 'Otro Nombre' }, cast)
    ).toBe(12)
  })

  test('nombre con vocal larga e inversión de coma', () => {
    expect(
      matchCastCharacter({ anilistId: 1, name: 'Kengo Dojima' }, cast)
    ).toBe(10)
  })

  test('nombre alternativo también cuenta', () => {
    expect(
      matchCastCharacter(
        { anilistId: 1, name: 'Unknown', alternativeNames: ['Narrator'] },
        cast
      )
    ).toBe(11)
  })

  test('ambiguo (dos candidatos) → sin emparejar', () => {
    const twins: CastMember[] = [
      { characterId: 20, name: 'Narrator', anilistId: null },
      { characterId: 21, name: 'narrator', anilistId: null },
    ]
    expect(matchCastCharacter({ anilistId: 1, name: 'Narrator' }, twins)).toBe(
      null
    )
  })

  test('mismo personaje con varios roles cuenta como un solo candidato', () => {
    const roles: CastMember[] = [
      { characterId: 30, name: 'Narrator', anilistId: null },
      { characterId: 30, name: 'Narrator', anilistId: null },
    ]
    expect(matchCastCharacter({ anilistId: 1, name: 'Narrator' }, roles)).toBe(
      30
    )
  })

  test('homónimo de OTRO medio no está en el reparto → sin emparejar', () => {
    // El "Narrator" global (otro anime) no se pasa: el reparto es de este medio.
    const otherMediaCast: CastMember[] = [
      { characterId: 40, name: 'Spike Spiegel', anilistId: null },
    ]
    expect(
      matchCastCharacter({ anilistId: 1, name: 'Narrator' }, otherMediaCast)
    ).toBe(null)
  })

  test('no empareja por nombre con un miembro ligado a otro anilist_id', () => {
    expect(
      matchCastCharacter({ anilistId: 999, name: 'Jet Black' }, cast)
    ).toBe(null)
  })
})

describe('planCharacterExternal (S2)', () => {
  test('sintético = 1e9 + id; un anilist_id por fila y por lote', () => {
    expect(ANILIST_ONLY_ID_BASE + 7).toBe(1_000_000_007)
    expect(
      planCharacterExternal([
        { characterId: 10, anilistId: 1 },
        { characterId: 10, anilistId: 1 },
        { characterId: 1_000_000_001, anilistId: 1 },
        { characterId: 11, anilistId: 2 },
      ])
    ).toEqual([
      { characterId: 10, anilistId: 1 },
      { characterId: 1_000_000_001, anilistId: null },
      { characterId: 11, anilistId: 2 },
    ])
  })
})

describe('mapCastRole (S3)', () => {
  test('MAIN/SUPPORTING/BACKGROUND → forma MAL', () => {
    expect(mapCastRole('MAIN')).toBe('Main')
    expect(mapCastRole('SUPPORTING')).toBe('Supporting')
    expect(mapCastRole('BACKGROUND')).toBe('Background')
    expect(mapCastRole('main')).toBe('Main')
  })

  test('desconocido → Title-case, nunca MAYÚSCULAS', () => {
    expect(mapCastRole('GUEST_STAR')).toBe('Guest star')
    expect(mapCastRole('')).toBe('Supporting')
  })
})

describe('mapRelationType para manga (S6)', () => {
  test('usa el vocabulario de MAL manga (SNAKE_CASE en mayúsculas)', () => {
    expect(mapRelationType('ALTERNATIVE', 'MANGA')).toBe('ALTERNATIVE_SETTING')
    expect(mapRelationType('SIDE_STORY', 'MANGA')).toBe('SIDE_STORY')
    expect(mapRelationType('PARENT', 'MANGA')).toBe('PARENT_STORY')
    expect(mapRelationType('SPIN_OFF', 'MANGA')).toBe('SPIN_OFF')
    expect(mapRelationType('SOURCE', 'MANGA')).toBe('OTHER')
  })
  test('anime sigue con la forma de MAL anime', () => {
    expect(mapRelationType('SIDE_STORY', 'ANIME')).toBe('Side story')
  })
})

describe('mapRelationType (S6)', () => {
  test('vocabulario MAL guardado', () => {
    expect(mapRelationType('ALTERNATIVE')).toBe('Alternative setting')
    expect(mapRelationType('SEQUEL')).toBe('Sequel')
    expect(mapRelationType('PREQUEL')).toBe('Prequel')
    expect(mapRelationType('SIDE_STORY')).toBe('Side story')
    expect(mapRelationType('PARENT')).toBe('Parent story')
    expect(mapRelationType('SPIN_OFF')).toBe('Spin-off')
    expect(mapRelationType('SUMMARY')).toBe('Summary')
    expect(mapRelationType('CHARACTER')).toBe('Character')
    expect(mapRelationType('ADAPTATION')).toBe('Adaptation')
    expect(mapRelationType('SOURCE')).toBe('Other')
    expect(mapRelationType('WHATEVER')).toBe('Other')
  })
})

describe('isRealAnilistImage (S5)', () => {
  test('descarta el placeholder /default.jpg|png', () => {
    expect(
      isRealAnilistImage(
        'https://s4.anilist.co/file/anilistcdn/character/large/default.jpg'
      )
    ).toBe(false)
    expect(
      isRealAnilistImage(
        'https://s4.anilist.co/file/anilistcdn/character/large/default.png'
      )
    ).toBe(false)
    expect(isRealAnilistImage(null)).toBe(false)
    expect(
      isRealAnilistImage(
        'https://s4.anilist.co/file/anilistcdn/character/large/b1-abc.png'
      )
    ).toBe(true)
  })
})

describe('resolveCastMediaId (S6: guarda de idMal)', () => {
  test('usa el id de la tarea; idMal igual o null es válido', () => {
    expect(resolveCastMediaId(5, 5)).toEqual({ mediaId: 5 })
    expect(resolveCastMediaId(5, null)).toEqual({ mediaId: 5 })
  })

  test('idMal distinto → se salta con motivo', () => {
    expect(resolveCastMediaId(5, 6)).toEqual({
      mediaId: null,
      mismatch: { taskMediaId: 5, anilistIdMal: 6 },
    })
  })

  test('sin id en la tarea → cae al idMal', () => {
    expect(resolveCastMediaId(undefined, 6)).toEqual({ mediaId: 6 })
    expect(resolveCastMediaId(undefined, null)).toEqual({ mediaId: null })
  })
})
