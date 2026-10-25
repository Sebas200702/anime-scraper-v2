import * as cheerio from 'cheerio'
import type { ScrapingTask } from '../types/index.js'

export interface MalProducerResult {
  producerId: number
  /** `null` cuando MAL no tiene logo (og:image es el icono por defecto). */
  logo: string | null
  established: string | null
  about: string | null
}

/**
 * Parser de la ficha de productor de MAL.
 *
 * - **Logo**: `meta[property="og:image"]`; se descarta el icono por defecto de
 *   MAL (no lleva `/company_logos/`).
 * - **Established / About**: bloques `div.spaceit_pad`. El de la descripción no
 *   tiene `span.dark_text` y es el texto largo.
 */
export const processMalProducer = (
  raw: { html: string; producerId: number },
  _task: ScrapingTask
): MalProducerResult => {
  // `<br>` no aporta texto: se convierte en un espacio para que "Fin.<br>It"
  // no quede pegado al extraer `.text()`.
  const $ = cheerio.load(raw.html.replace(/<br\s*\/?>/gi, '<br> '))

  const ogImage = $('meta[property="og:image"]').attr('content')?.trim() ?? ''
  const logo = ogImage.includes('/company_logos/') ? ogImage : null

  let established: string | null = null
  let about: string | null = null

  $('div.spaceit_pad').each((_, element) => {
    const node = $(element)
    const label = node.find('span.dark_text').first().text().trim()

    if (label.toLowerCase().startsWith('established')) {
      const value = node.text().replace(label, '').replace(/\s+/g, ' ').trim()
      if (value) established = value
      return
    }

    if (label) return

    const text = node.text().replace(/\s+/g, ' ').trim()
    // La descripción del estudio es el bloque sin etiqueta y con texto largo.
    if (!about && text.length > 80) about = text
  })

  return { producerId: raw.producerId, logo, established, about }
}
