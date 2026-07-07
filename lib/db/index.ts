import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '@/lib/db/schema'

const globalForDb = globalThis as typeof globalThis & {
  lumihooPgPool?: Pool
  lumihooDb?: ReturnType<typeof drizzle<typeof schema>>
  lumihooDbReady?: Promise<void>
}

function databaseUrl() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL is required.')
  return url
}

export function getDb() {
  if (!globalForDb.lumihooPgPool) {
    globalForDb.lumihooPgPool = new Pool({
      connectionString: databaseUrl(),
    })
  }

  if (!globalForDb.lumihooDb) {
    globalForDb.lumihooDb = drizzle(globalForDb.lumihooPgPool, { schema })
  }

  return globalForDb.lumihooDb
}

export async function ensureDatabase() {
  if (!globalForDb.lumihooDbReady) {
    globalForDb.lumihooDbReady = getDb().execute(sql`
      CREATE TABLE IF NOT EXISTS generated_images (
        id uuid PRIMARY KEY,
        prompt text NOT NULL,
        bucket text NOT NULL,
        object_key text NOT NULL UNIQUE,
        public_url text NOT NULL,
        content_type text NOT NULL,
        size_bytes bigint NOT NULL,
        model text NOT NULL,
        preset text NOT NULL,
        image_size text NOT NULL,
        seed bigint,
        etag text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `).then(() => undefined)
  }

  await globalForDb.lumihooDbReady
}
