import { fullSizeImage, type MalPersonPayload } from '../services/malPerson.js'
import type { ScrapingTask } from '../types/index.js'

/**
 * Mapea la ficha de una persona de MAL (staff o personaje) a las filas del
 * catálogo: perfil, alias y retrato.
 */
export const processMalPerson = (
  raw: { person: MalPersonPayload; kind: 'staff' | 'character' },
  _task: ScrapingTask
) => {
  const { person, kind } = raw
  const name =
    person.name ??
    [person.givenName, person.familyName].filter(Boolean).join(' ') ??
    `Personaje ${person.id}`

  return {
    kind,
    id: person.id,
    name,
    givenName: person.givenName,
    familyName: person.familyName,
    nativeName: person.nativeName,
    about: person.about,
    birthday: person.birthday,
    imageUrl: fullSizeImage(person.imageUrl),
    alternativeNames: person.alternativeNames.filter(
      (n) => typeof n === 'string' && n.trim().length > 0 && n !== name
    ),
  }
}

export type MalPersonProcessorResult = ReturnType<typeof processMalPerson>
