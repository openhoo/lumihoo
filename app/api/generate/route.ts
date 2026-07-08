import { storeGeneratedImages } from '@/lib/generated-images'
import {
  getActiveModelProfile,
  ModelProfileConfigError,
  sizeLabel,
  type ModelProfile,
  type PromptFormat,
} from '@/lib/model-profiles'

export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_IMAGES = 4
const MAX_PROMPT_LENGTH = 2000

type SglangImage = {
  b64_json?: unknown
  is_image_safe?: unknown
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

type RequestedValue<T> =
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

function requestedAllowedValue<T extends string>(
  name: string,
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): RequestedValue<T> {
  if (value === undefined || value === null || value === '') return { ok: true, value: fallback }
  if (typeof value === 'string' && allowed.includes(value as T)) {
    return { ok: true, value: value as T }
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

function greatestCommonDivisor(left: number, right: number): number {
  return right === 0 ? left : greatestCommonDivisor(right, left % right)
}

function aspectRatioFromSize(size: string) {
  const [width, height] = size.split('x').map(Number)
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    return '1:1'
  }

  const divisor = greatestCommonDivisor(width, height)
  return `${width / divisor}:${height / divisor}`
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function ideogramJsonPrompt(prompt: string, size: string) {
  const parsedPrompt = parseJsonObject(prompt)
  if (parsedPrompt) return JSON.stringify(parsedPrompt)

  return JSON.stringify({
    aspect_ratio: aspectRatioFromSize(size),
    high_level_description: prompt,
    compositional_deconstruction: {
      background: 'The background, setting, lighting, and atmosphere should match the high-level description.',
      elements: [
        {
          type: 'obj',
          bbox: [0, 0, 1000, 1000],
          desc: prompt,
        },
      ],
    },
  })
}

function upstreamPrompt(prompt: string, size: string, format: PromptFormat): { format: PromptFormat; prompt: string } {
  if (format === 'text') return { format: 'text', prompt }
  return { format: 'ideogram-json', prompt: ideogramJsonPrompt(prompt, size) }
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
    if (res.status === 422) {
      return upstreamMessage(payload) || 'The image request was blocked by upstream safety checks.'
    }

    return upstreamMessage(payload) || `SGLang returned ${res.status}.`
  }

  const text = await res.text().catch(() => '')
  return text.trim() || `SGLang returned ${res.status}.`
}

async function imagesFromPayload(payload: SglangImageResponse, signal: AbortSignal) {
  if (!Array.isArray(payload.data)) return []

  const images: ImageBytes[] = []

  for (const item of payload.data) {
    if (!item || typeof item !== 'object') continue

    const image = item as SglangImage
    if (image.is_image_safe === false) continue

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

function hasUnsafeImage(payload: SglangImageResponse) {
  return (
    Array.isArray(payload.data) &&
    payload.data.some((item) => Boolean(item) && typeof item === 'object' && (item as SglangImage).is_image_safe === false)
  )
}

function activeProfileOrResponse() {
  try {
    return { profile: getActiveModelProfile() }
  } catch (err) {
    if (err instanceof ModelProfileConfigError) {
      return {
        response: Response.json({ error: err.message }, { status: 500 }),
      }
    }

    throw err
  }
}

function requestedPreset(profile: ModelProfile, value: unknown): RequestedValue<string | null> {
  if (profile.presets.length === 0) {
    if (value === undefined || value === null || value === '') return { ok: true, value: null }

    return {
      ok: false,
      error: 'Preset is not supported by the active model profile.',
    }
  }

  return requestedAllowedValue(
    'Preset',
    value,
    profile.presets.map((preset) => preset.value),
    profile.defaultPreset || profile.presets[0].value,
  )
}

function controlsResponse(profile: ModelProfile) {
  return {
    count: {
      values: Array.from({ length: MAX_IMAGES }, (_, index) => index + 1),
      default: 1,
    },
    presets: profile.presets,
    defaultPreset: profile.defaultPreset,
    sizes: profile.sizes.map((size) => ({ value: size, label: sizeLabel(size) })),
    defaultSize: profile.defaultSize,
    seed: {
      supported: true,
      default: profile.defaultSeed ?? null,
    },
    maxPromptLength: MAX_PROMPT_LENGTH,
  }
}

export function GET() {
  const active = activeProfileOrResponse()
  if (active.response) return active.response

  return Response.json(controlsResponse(active.profile))
}

export async function POST(req: Request) {
  const active = activeProfileOrResponse()
  if (active.response) return active.response

  const profile = active.profile
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

  const preset = requestedPreset(profile, body.preset)
  if (!preset.ok) return Response.json({ error: preset.error }, { status: 400 })

  const size = requestedAllowedValue('Size', body.size, profile.sizes, profile.defaultSize)
  if (!size.ok) return Response.json({ error: size.error }, { status: 400 })

  const requestedSeed = optionalSeed(body.seed)
  if (requestedSeed.error) return Response.json({ error: requestedSeed.error }, { status: 400 })

  const seed = requestedSeed.value ?? profile.defaultSeed
  const generatedPrompt = upstreamPrompt(prompt, size.value, profile.promptFormat)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), profile.timeoutMs)

  try {
    const upstreamBody: Record<string, unknown> = {
      ...profile.extraBody,
      model: profile.model,
      prompt: generatedPrompt.prompt,
      n: count,
      size: size.value,
      response_format: 'b64_json',
    }

    if (preset.value) upstreamBody.preset = preset.value
    if (seed !== undefined) upstreamBody.seed = seed

    const res = await fetch(`${profile.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${profile.apiKey}`,
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
      const message = hasUnsafeImage(payload)
        ? 'The image request was blocked by upstream safety checks.'
        : upstreamMessage(payload) || 'SGLang did not return any images.'
      return Response.json({ error: message }, { status: 502 })
    }

    const items = await storeGeneratedImages({
      images,
      prompt,
      profileId: profile.id,
      model: profile.model,
      preset: preset.value,
      imageSize: size.value,
      seed,
    })

    return Response.json({
      images: items.map((item) => item.src),
      items,
      options: {
        profileId: profile.id,
        model: profile.model,
        preset: preset.value,
        size: size.value,
        seed: seed ?? null,
        promptFormat: generatedPrompt.format,
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
