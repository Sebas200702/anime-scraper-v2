import { sql } from 'drizzle-orm'
import { db } from '../libs/db.js'
import { taskRepository } from '../repositories/tasks.js'

/**
 * Siembra una tarea por **canción con enlace de tienda** para completar su
 * ficha: título exacto (Spotify), álbum, duración, fecha de publicación y
 * portada (iTunes).
 */
export const initializeMusicMetaTasks = async () => {
  const existing = await taskRepository.getExistingEntityIds('musicMeta')
  console.log(
    `Found ${existing.size} existing musicMeta tasks — skipping those`
  )

  const rows = (
    await db.execute(sql`
      SELECT m.id AS music_id,
             MAX(s.external_id) FILTER (WHERE s.provider = 'spotify') AS spotify_id,
             MAX(s.external_id) FILTER (WHERE s.provider = 'apple') AS apple_id
      FROM music m
      JOIN music_stream s ON s.music_id = m.id
      WHERE s.external_id IS NOT NULL
      GROUP BY m.id
      ORDER BY m.id
    `)
  ).rows as unknown as {
    music_id: number
    spotify_id: string | null
    apple_id: string | null
  }[]

  const tasks = rows
    .filter((row) => !existing.has(`music_${row.music_id}`))
    .map((row) => ({
      source: 'musicMeta',
      entityId: `music_${row.music_id}`,
      taskType: 'music_meta_hydration',
      priority: 10,
      status: 'pending' as const,
      payload: {
        musicId: row.music_id,
        spotifyId: row.spotify_id,
        appleId: row.apple_id,
      },
    }))

  if (tasks.length > 0) await taskRepository.createManyTasks(tasks)
  console.log(`✓ Created ${tasks.length} music metadata tasks`)
}
