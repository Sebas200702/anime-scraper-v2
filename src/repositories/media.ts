import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../libs/db.js'
import {
  animeMedia,
  characterMedia,
  episodeMedia,
  musicMedia,
  producerMedia,
  staffMedia,
} from '../schemas/media.js'
import type { NewMedia } from '../types/index.js'

/**
 * El catálogo de anidev normaliza la media **por entidad** (`anime_media`,
 * `character_media`, …) en vez de una tabla `media` polimórfica, y esas tablas
 * no tienen índice único sobre su clave natural. Así que aquí se enruta cada
 * ítem a su tabla y se descarta lo ya presente, para que re-ejecutar el
 * backfill no duplique filas.
 */

type MediaTable = typeof animeMedia

const mediaWarned = new Set<string>()

const MEDIA_TABLES: Record<string, unknown> = {
  anime: animeMedia,
  character: characterMedia,
  staff: staffMedia,
  producer: producerMedia,
  episode: episodeMedia,
  music: musicMedia,
}

// Las tablas comparten columnas comunes pero no su FK, así que se usa una y se
// castea en el punto de uso (el FK lo resuelve `columnFor`).
const tableFor = (entityType: string): MediaTable | null =>
  (MEDIA_TABLES[entityType] as MediaTable | undefined) ?? null

const fkColumnFor = (
  entityType: string
):
  | 'animeId'
  | 'characterId'
  | 'staffId'
  | 'producerId'
  | 'episodeId'
  | 'musicId' => {
  switch (entityType) {
    case 'character':
      return 'characterId'
    case 'staff':
      return 'staffId'
    case 'producer':
      return 'producerId'
    case 'episode':
      return 'episodeId'
    case 'music':
      return 'musicId'
    default:
      return 'animeId'
  }
}

const columnFor = (entityType: string) => {
  switch (entityType) {
    case 'character':
      return characterMedia.characterId
    case 'staff':
      return staffMedia.staffId
    case 'producer':
      return producerMedia.producerId
    case 'episode':
      return episodeMedia.episodeId
    case 'music':
      return musicMedia.musicId
    default:
      return animeMedia.animeId
  }
}

const keyOf = (entityId: number, mediaType: string, src: string) =>
  `${entityId}|${mediaType}|${src}`

export const mediaRepository = {
  async saveMedia(items: NewMedia[]): Promise<number> {
    if (items.length === 0) return 0

    // 'artist' u otro tipo sin tabla en el DDL de anidev: se avisa una vez y se
    // descarta (mejor explícito que perderlo en silencio).
    const unsupported = items.filter((item) => !tableFor(item.entityType))
    if (unsupported.length > 0) {
      const types = [...new Set(unsupported.map((i) => i.entityType))].join(
        ', '
      )
      if (!mediaWarned.has(types)) {
        mediaWarned.add(types)
        console.warn(
          `📡 Media sin tabla en el DDL de anidev (${types}): ${unsupported.length} ítem(s) descartado(s)`
        )
      }
    }

    let saved = 0

    for (const entityType of [
      'anime',
      'character',
      'staff',
      'producer',
      'episode',
      'music',
    ] as const) {
      const table = tableFor(entityType)
      if (!table) continue

      const rows = items.filter((item) => item.entityType === entityType)
      if (rows.length === 0) continue

      const fk = fkColumnFor(entityType)
      const column = columnFor(entityType)
      const ids = [...new Set(rows.map((row) => row.entityId))]

      // Sin índice único en el DDL: se filtra lo que ya está antes de insertar
      // (idempotencia del backfill sin inventar constraints que no son nuestros).
      const existing = await db
        .select({
          entityId: column,
          mediaType: table.mediaType,
          src: table.src,
        })
        .from(table)
        .where(inArray(column, ids))

      const present = new Set(
        existing.map((row) =>
          keyOf(row.entityId as number, row.mediaType, row.src)
        )
      )

      const pending = rows
        .filter(
          (row) => !present.has(keyOf(row.entityId, row.mediaType, row.src))
        )
        .map((row) => ({
          [fk]: row.entityId,
          mediaType: row.mediaType,
          src: row.src,
          size: row.size ?? null,
        })) as (typeof table.$inferInsert)[]

      if (pending.length === 0) continue

      const chunkSize = 500
      for (let i = 0; i < pending.length; i += chunkSize) {
        const inserted = await db
          .insert(table)
          .values(pending.slice(i, i + chunkSize))
          .onConflictDoNothing()
          .returning({ id: table.id })
        saved += inserted.length
      }
    }

    return saved
  },

  /** Limpia una media concreta (uso puntual desde los repositorios). */
  async deleteMedia(entityType: string, entityId: number, src: string) {
    const table = tableFor(entityType)
    if (!table) return
    await db
      .delete(table)
      .where(and(eq(columnFor(entityType), entityId), eq(table.src, src)))
  },
}
