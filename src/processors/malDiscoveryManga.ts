import type { MalMangaNode } from '../services/malManga.js'
import type { ScrapingTask } from '../types/index.js'
import { processMalManga } from './malManga.js'

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
 */
export const processMalDiscoveryMangaRanking = (
  raw: { nodes?: MalMangaNode[] },
  task: ScrapingTask
): { rows: MinimalMangaRow[] } => {
  const rows = new Map<number, MinimalMangaRow>()
  for (const node of raw.nodes ?? []) {
    const title = node?.title?.trim()
    if (!node?.id || !title || rows.has(node.id)) continue
    const { manga } = processMalManga({ mangaId: node.id, node }, task)
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
  return { rows: [...rows.values()] }
}
