import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { sql } from 'drizzle-orm'
import { CONFIG } from '../config/config.js'

const client = createClient({
  url: CONFIG.TURSO_DATABASE_URL,
  authToken: CONFIG.TURSO_AUTH_TOKEN,
})

export const db = drizzle(client)

export const enableForeignKeys = async () => await db.run(sql`PRAGMA foreign_keys = ON`)
