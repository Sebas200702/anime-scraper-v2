import type { CharacterProcessorResult } from '../../types/index.js'
import type { Character } from '../../types/jikanApi.js'
import { extractSingleMedia } from '../../shared/mediaExtractor.js'
import { nativeNameOrNull } from '../../utils/characterName.js'

export const mapCharacter = (character: Character): CharacterProcessorResult => {
  return {
    character: {
      malId: character.mal_id,
      name: character.name,
      // S4: el romaji ASCII no es nombre nativo.
      nameKanji: nativeNameOrNull(character.name_kanji),
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
