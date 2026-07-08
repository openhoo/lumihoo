import { bigint, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const generatedImages = pgTable('generated_images', {
  id: uuid('id').primaryKey(),
  prompt: text('prompt').notNull(),
  bucket: text('bucket').notNull(),
  objectKey: text('object_key').notNull().unique(),
  publicUrl: text('public_url').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  profileId: text('profile_id').notNull(),
  model: text('model').notNull(),
  preset: text('preset'),
  imageSize: text('image_size').notNull(),
  seed: bigint('seed', { mode: 'number' }),
  etag: text('etag'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type GeneratedImage = typeof generatedImages.$inferSelect
export type NewGeneratedImage = typeof generatedImages.$inferInsert
