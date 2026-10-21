import { parseMalMangaPage } from '../shared/malMangaPageHtml.js'
import type { ScrapingTask } from '../types/index.js'

/** Mapea la página de la obra al staff con su rol. */
export const processMalMangaPage = (
  raw: { mangaId: number; staff: ReturnType<typeof parseMalMangaPage> },
  _task: ScrapingTask
) => ({
  mangaId: raw.mangaId,
  staff: raw.staff.map((s) => ({
    mangaId: raw.mangaId,
    staffId: s.malId,
    name: s.name,
    role: s.roles[0] ?? 'Unknown',
  })),
})

export type MalMangaPageProcessorResult = ReturnType<typeof processMalMangaPage>
