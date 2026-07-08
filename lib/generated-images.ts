import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import * as Minio from 'minio'
import { ensureDatabase, getDb } from '@/lib/db'
import { generatedImages, type GeneratedImage, type NewGeneratedImage } from '@/lib/db/schema'

type ImageInput = {
  buffer: Buffer
  contentType: string
}

type StoreGeneratedImagesInput = {
  images: ImageInput[]
  prompt: string
  profileId: string
  model: string
  preset: string | null
  imageSize: string
  seed?: number
}

export type StoredGeneratedImage = {
  id: string
  prompt: string
  src: string
  createdAt: string
}

const DEFAULT_BUCKET = 'lumihoo-images'
const DEFAULT_PUBLIC_IMAGE_BASE_URL = '/images'
const DEFAULT_MINIO_REGION = 'us-east-1'

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const globalForImages = globalThis as typeof globalThis & {
  lumihooMinioClient?: Minio.Client
  lumihooStorageReady?: Promise<void>
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function parsePort(value: string | undefined, fallback: number) {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 ? port : fallback
}

function minioConfig() {
  const rawEndpoint = process.env.MINIO_ENDPOINT?.trim() || 'localhost'
  let endPoint = rawEndpoint
  let port = parsePort(process.env.MINIO_PORT, 9000)
  let useSSL = parseBoolean(process.env.MINIO_USE_SSL, false)

  if (rawEndpoint.startsWith('http://') || rawEndpoint.startsWith('https://')) {
    const url = new URL(rawEndpoint)
    endPoint = url.hostname
    port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
    useSSL = url.protocol === 'https:'
  }

  const accessKey = process.env.MINIO_ACCESS_KEY?.trim()
  const secretKey = process.env.MINIO_SECRET_KEY?.trim()

  if (!accessKey || !secretKey) {
    throw new Error('MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required.')
  }

  return { endPoint, port, useSSL, accessKey, secretKey }
}

function imageBucket() {
  return process.env.MINIO_BUCKET?.trim() || DEFAULT_BUCKET
}

function imageRegion() {
  return process.env.MINIO_REGION?.trim() || DEFAULT_MINIO_REGION
}

function getMinioClient() {
  if (!globalForImages.lumihooMinioClient) {
    globalForImages.lumihooMinioClient = new Minio.Client(minioConfig())
  }

  return globalForImages.lumihooMinioClient
}

async function ensureBucket() {
  const client = getMinioClient()
  const bucket = imageBucket()
  const exists = await client.bucketExists(bucket)
  if (!exists) await client.makeBucket(bucket, imageRegion())
}

async function ensureStorage() {
  if (!globalForImages.lumihooStorageReady) {
    globalForImages.lumihooStorageReady = Promise.all([ensureDatabase(), ensureBucket()]).then(
      () => undefined,
    )
  }

  await globalForImages.lumihooStorageReady
}

function normalizeContentType(contentType: string) {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase()
  return normalized && normalized.startsWith('image/') ? normalized : 'image/png'
}

function extensionForContentType(contentType: string) {
  return IMAGE_EXTENSIONS[normalizeContentType(contentType)] || 'png'
}

function objectDatePrefix(date = new Date()) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

function publicImageUrl(objectKey: string) {
  const base = (process.env.PUBLIC_IMAGE_BASE_URL?.trim() || DEFAULT_PUBLIC_IMAGE_BASE_URL).replace(
    /\/+$/,
    '',
  )
  return `${base}/${objectKey}`
}

function toStoredGeneratedImage(image: GeneratedImage): StoredGeneratedImage {
  return {
    id: image.id,
    prompt: image.prompt,
    src: image.publicUrl,
    createdAt: image.createdAt.toISOString(),
  }
}

async function removeUploadedObjects(objectKeys: string[]) {
  if (objectKeys.length === 0) return
  const client = getMinioClient()
  const bucket = imageBucket()
  await Promise.all(objectKeys.map((objectKey) => client.removeObject(bucket, objectKey).catch(() => undefined)))
}

export async function storeGeneratedImages(input: StoreGeneratedImagesInput) {
  await ensureStorage()

  const client = getMinioClient()
  const bucket = imageBucket()
  const uploadedObjectKeys: string[] = []
  const rows: NewGeneratedImage[] = input.images.map((image) => {
    const id = randomUUID()
    const contentType = normalizeContentType(image.contentType)
    const objectKey = `generated/${objectDatePrefix()}/${id}.${extensionForContentType(contentType)}`

    return {
      id,
      prompt: input.prompt,
      bucket,
      objectKey,
      publicUrl: publicImageUrl(objectKey),
      contentType,
      sizeBytes: image.buffer.length,
      profileId: input.profileId,
      model: input.model,
      preset: input.preset ?? null,
      imageSize: input.imageSize,
      seed: input.seed,
      etag: null,
    }
  })

  try {
    for (let index = 0; index < input.images.length; index += 1) {
      const image = input.images[index]
      const row = rows[index]
      const result = await client.putObject(bucket, row.objectKey, image.buffer, image.buffer.length, {
        'Content-Type': row.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      })

      row.etag = result.etag || null
      uploadedObjectKeys.push(row.objectKey)
    }
  } catch (err) {
    await removeUploadedObjects(uploadedObjectKeys)
    throw err
  }

  try {
    const inserted = await getDb().insert(generatedImages).values(rows).returning()
    return inserted.map(toStoredGeneratedImage)
  } catch (err) {
    await removeUploadedObjects(uploadedObjectKeys)
    throw err
  }
}

export async function getGeneratedImageById(id: string) {
  if (!UUID_RE.test(id)) return null

  await ensureDatabase()

  const [image] = await getDb()
    .select()
    .from(generatedImages)
    .where(eq(generatedImages.id, id))
    .limit(1)

  return image ? toStoredGeneratedImage(image) : null
}
