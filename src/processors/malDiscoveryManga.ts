import type { MalMangaNode } from '../services/malManga.js'
import type { ScrapingTask } from '../types/index.js'
import { type MalMangaProcessorResult, processMalManga } from './malManga.js'

/** Fila mínima de `manga` para un id que MAL lista y el catálogo no tiene. */
export interface MinimalMangaRow {
  malId: number
  title: string
  type: string
  status: string | null
  chapters: number | null
  volumes: number | null
  year: number | null
}

/**
 * Ranking de manga (S6): una fila mínima por nodo, mapeada con el mismo
 * `processMalManga` de la ficha (tipo `media_type` o `'manga'`, estado y año
 * de MAL), así el vocabulario no diverge. Los nodos sin título se omiten:
 * `title` es NOT NULL y no se inventa. Un id repetido cuenta una vez.
 * `inserted` (barrido por tramos, L9) son las filas que el servicio ya guardó
 * página a página; se arrastra para que el guardado final las cuente.
 * `details` (L12) es la ficha completa de cada fila: el repositorio la aplica
 * solo a los ids que acaba de insertar.
 */
export const processMalDiscoveryMangaRanking = (
  raw: { nodes?: MalMangaNode[]; inserted?: number },
  task: ScrapingTask
): {
  rows: MinimalMangaRow[]
  details: MalMangaProcessorResult[]
  inserted?: number
} => {
  const rows = new Map<number, MinimalMangaRow>()
  const details = new Map<number, MalMangaProcessorResult>()
  for (const node of raw.nodes ?? []) {
    const title = node?.title?.trim()
    if (!node?.id || !title || rows.has(node.id)) continue
    const detail = processMalManga({ mangaId: node.id, node }, task)
    const { manga } = detail
    details.set(node.id, { ...detail, manga: { ...manga, title } })
    rows.set(node.id, {
      malId: manga.malId,
      title,
      type: manga.type,
      status: manga.status,
      chapters: manga.chapters,
      volumes: manga.volumes,
      year: manga.year,
    })
  }
  const result = { rows: [...rows.values()], details: [...details.values()] }
  return raw.inserted === undefined
    ? result
    : { ...result, inserted: raw.inserted }
}
