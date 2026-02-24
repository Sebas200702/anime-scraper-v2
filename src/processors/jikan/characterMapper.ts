import type { CharacterProcessorResult } from '../../types/index.js'
import type { Character } from '../../types/jikanApi.js'
import { extractSingleMedia } from '../../shared/mediaExtractor.js'

export const mapCharacter = (character: Character): CharacterProcessorResult => {
  return {
    character: {
      malId: character.mal_id,
      name: character.name,
      nameKanji: character.name_kanji,
      about: character.about,
    },
    nicknames: (character.nicknames || []).map((nickname) => ({
      characterId: character.mal_id,
      nickname,
    })),
    characterMedia: extractSingleMedia(
      character.images,
      character.mal_id,
      'character',
      'picture'
    ),
  }
}
