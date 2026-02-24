/**
 * Re-exports all MAL processors from their focused sub-modules.
 * Maintains backward compatibility with genericWorker dynamic import.
 */
export { processAnime } from './mal/animeDetails.js'
export { processAnimeCharacters, processAnimeStaff } from './mal/relations.js'
