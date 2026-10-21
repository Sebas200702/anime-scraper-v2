import type { MalPeopleProcessorResult, ScrapingTask } from '../types/index.js'

/**
 * Extrae el retrato de una persona desde el `og:image` de su ficha de MAL.
 *
 * Se usa `og:image` (y no la imagen del cuerpo) porque viene con la URL
 * completa: la del HTML lleva el prefijo de reescalado (`/r/225x350/`).
 */
const OG_IMAGE = /<meta\s+property="og:image"\s+content="([^"]+)"/i

export const processMalPeople = (
  raw: { html: string; staffId: number },
  _task: ScrapingTask
): MalPeopleProcessorResult => {
  const match = raw.html.match(OG_IMAGE)
  const src = match?.[1]
  if (!src || !src.startsWith('http')) return { staffMedia: [] }

  return {
    staffMedia: [{ entityId: raw.staffId, src, mediaType: 'poster' }],
  }
}
