/**
 * Selección de un `Media` profundo. Las páginas de reparto y staff van como
 * texto: variables en la query de un medio, `1` literal en la de lotes (T11).
 */
export const mediaDeepSelection = (charPage: string, staffPage: string) =>
  `    id
    idMal
    type
    characters(page: ${charPage}, perPage: 50, sort: [ROLE, RELEVANCE, ID]) {
      pageInfo { total hasNextPage }
      edges {
        role
        node {
          id
          name { full native alternative }
          image { large }
          description(asHtml: false)
          gender
          dateOfBirth { year }
          bloodType
          age
          favourites
        }
        voiceActors(language: JAPANESE) { id name { full native } }
      }
    }
    staff(page: ${staffPage}, perPage: 50, sort: [RELEVANCE, ID]) {
      pageInfo { total hasNextPage }
      edges {
        role
        node {
          id
          name { full native alternative }
          description(asHtml: false)
          gender
          dateOfBirth { year }
          favourites
        }
      }
    }
    relations {
      edges { relationType node { id idMal type } }
    }
    externalLinks { id site url type }`
