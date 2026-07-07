import { storeGeneratedImages } from '@/lib/generated-images'

export const runtime = 'nodejs'
export const maxDuration = 120

const DEFAULT_SGLANG_BASE_URL = 'http://localhost:30010/v1'
const DEFAULT_MODEL = 'ideogram-ai/ideogram-4-nf4'
const DEFAULT_PRESET = 'V4_QUALITY_48'
const DEFAULT_SIZE = '1024x1024'
const DEFAULT_TIMEOUT_MS = 110_000
const MAX_IMAGES = 4
const MAX_PROMPT_LENGTH = 2000

const PRESETS = ['V4_DEFAULT_20', 'V4_QUALITY_48', 'V4_TURBO_12'] as const
const SIZES = ['1024x1024', '2048x2048'] as const

type SglangImage = {
  b64_json?: unknown
  url?: unknown
}

type SglangImageResponse = {
  data?: unknown
  error?: unknown
}

type ImageBytes = {
  buffer: Buffer
  contentType: string
}

type RequestedValue<T extends string> =
  | {
      ok: true
      value: T
    }
  | {
      ok: false
      error: string
    }

function getBodyObject(body: unknown) {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null
}

function clampImageCount(value: unknown) {
  const count = Math.trunc(Number(value) || 1)
  return Math.min(Math.max(count, 1), MAX_IMAGES)
}

function normalizeBaseUrl(value: string | undefined) {
  const trimmed = (value || DEFAULT_SGLANG_BASE_URL).trim().replace(/\/+$/, '')
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`
}

function allowedValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === 'string' && allowed.includes(value as T[number])
    ? (value as T[number])
    : fallback
}

function requestedAllowedValue<T extends readonly string[]>(
  name: string,
  value: unknown,
  allowed: T,
  fallback: T[number],
) : RequestedValue<T[number]> {
  if (value === undefined || value === null || value === '') return { ok: true, value: fallback }
  if (typeof value === 'string' && allowed.includes(value as T[number])) {
    return { ok: true, value: value as T[number] }
  }

  return {
    ok: false,
    error: `${name} must be one of: ${allowed.join(', ')}.`,
  }
}

function optionalSeed(value: unknown) {
  if (value === undefined || value === null || value === '') return { value: undefined }

  const seed = Number(value)
  if (Number.isSafeInteger(seed) && seed >= 0) return { value: seed }

  return { error: 'Seed must be a non-negative integer.' }
}

function timeoutMs() {
  const value = Number(process.env.SGLANG_TIMEOUT_MS)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(value, 1_000), 300_000)
}

function imageGenerationUrl() {
  return `${normalizeBaseUrl(process.env.SGLANG_BASE_URL)}/images/generations`
}

function upstreamMessage(payload: unknown) {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const error = record.error

    if (typeof error === 'string') return error
    if (error && typeof error === 'object') {
      const message = (error as Record<string, unknown>).message
      if (typeof message === 'string') return message
    }

    const message = record.message
    if (typeof message === 'string') return message
  }

  return null
}

async function readUpstreamError(res: Response) {
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const payload = await res.json().catch(() => null)
    return upstreamMessage(payload) || `SGLang returned ${res.status}.`
  }

  const text = await res.text().catch(() => '')
  return text.trim() || `SGLang returned ${res.status}.`
}

async function imagesFromPayload(payload: SglangImageResponse, signal: AbortSignal) {
  if (!Array.isArray(payload.data)) return []

  const images: ImageBytes[] = []

  for (const image of payload.data as SglangImage[]) {
    if (typeof image.b64_json === 'string') {
      const buffer = Buffer.from(image.b64_json, 'base64')
      if (buffer.length > 0) images.push({ buffer, contentType: 'image/png' })
      continue
    }

    if (typeof image.url === 'string') {
      const res = await fetch(image.url, { signal })
      if (!res.ok) throw new Error('Unable to download generated image.')

      const contentType = res.headers.get('content-type') || 'image/png'
      const buffer = Buffer.from(await res.arrayBuffer())
      if (buffer.length > 0) images.push({ buffer, contentType })
    }
  }

  return images
}

export async function POST(req: Request) {
  const parsedBody = await req.json().catch(() => null)
  const body = getBodyObject(parsedBody)

  if (!body) {
    return Response.json({ error: 'Please provide a JSON request body.' }, { status: 400 })
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const count = clampImageCount(body.count)

  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
    return Response.json({ error: 'Please provide a valid prompt.' }, { status: 400 })
  }

  const envPreset = allowedValue(process.env.IDEOGRAM_PRESET, PRESETS, DEFAULT_PRESET)
  const preset = requestedAllowedValue('Preset', body.preset, PRESETS, envPreset)
  if (!preset.ok) return Response.json({ error: preset.error }, { status: 400 })

  const envSize = allowedValue(process.env.IDEOGRAM_SIZE, SIZES, DEFAULT_SIZE)
  const size = requestedAllowedValue('Size', body.size, SIZES, envSize)
  if (!size.ok) return Response.json({ error: size.error }, { status: 400 })

  const envSeed = optionalSeed(process.env.IDEOGRAM_SEED)
  const requestedSeed = optionalSeed(body.seed)
  if (requestedSeed.error) return Response.json({ error: requestedSeed.error }, { status: 400 })

  const seed = requestedSeed.value ?? envSeed.value
  const model = process.env.SGLANG_IMAGE_MODEL?.trim() || DEFAULT_MODEL
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs())

  try {
    const upstreamBody: Record<string, unknown> = {
      model,
      prompt,
      n: count,
      size: size.value,
      response_format: 'b64_json',
      preset: preset.value,
    }

    if (seed !== undefined) upstreamBody.seed = seed

    const res = await fetch(imageGenerationUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SGLANG_API_KEY || 'EMPTY'}`,
      },
      body: JSON.stringify(upstreamBody),
      signal: controller.signal,
    })

    if (!res.ok) {
      const message = await readUpstreamError(res)
      return Response.json({ error: message }, { status: 502 })
    }

    const payload = (await res.json()) as SglangImageResponse
    const images = await imagesFromPayload(payload, controller.signal)

    if (images.length === 0) {
      const message = upstreamMessage(payload) || 'SGLang did not return any images.'
      return Response.json({ error: message }, { status: 502 })
    }

    const items = await storeGeneratedImages({
      images,
      prompt,
      model,
      preset: preset.value,
      imageSize: size.value,
      seed,
    })

    return Response.json({
      images: items.map((item) => item.src),
      items,
      options: {
        model,
        preset: preset.value,
        size: size.value,
        seed: seed ?? null,
      },
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return Response.json({ error: 'SGLang image generation timed out.' }, { status: 504 })
    }

    console.error(err)
    return Response.json({ error: 'SGLang image generation or storage failed.' }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
