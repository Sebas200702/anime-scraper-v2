import { unique } from "../utils/deduplicate.js"

const nicknames = [
  { characterId: 10, nickname: 'Shadow' },
  { characterId: 10, nickname: 'Ghost' },
  { characterId: 10, nickname: 'Shadow' }, // duplicado
  { characterId: 11, nickname: 'Prince' },
  { characterId: 11, nickname: 'Prince' }, // duplicado
  { characterId: 10, nickname: 'Phantom' },
]

const uniqueNicknames = unique(
  nicknames,
  (n) => `${n.characterId}:${n.nickname}`
)

console.log('Nicknames únicos:', uniqueNicknames)

console.assert(
  uniqueNicknames.length === 4,
  '❌ Falló deduplicación de nicknames'
)
