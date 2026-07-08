import { storeGeneratedImages } from '@/lib/generated-images'
import {
  getActiveModelProfile,
  ModelProfileConfigError,
  sizeLabel,
  type ModelProfile,
  type ModelStylePreset,
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

function stylePromptText(stylePreset: ModelStylePreset | null) {
  return stylePreset?.prompt.trim() || ''
}

function styleInstruction(prompt: string, stylePreset: ModelStylePreset | null) {
  const stylePrompt = stylePromptText(stylePreset)
  return stylePrompt ? `${prompt}\n\nStyle preset: ${stylePrompt}` : prompt
}

function orderedObject(value: Record<string, unknown>, preferredKeys: readonly string[]) {
  const ordered: Record<string, unknown> = {}

  for (const key of preferredKeys) {
    if (value[key] !== undefined) ordered[key] = value[key]
  }

  for (const [key, item] of Object.entries(value)) {
    if (ordered[key] === undefined) ordered[key] = item
  }

  return ordered
}

function orderedStyleDescription(value: Record<string, unknown>) {
  const preferredKeys = value.art_style !== undefined && value.photo === undefined
    ? ['aesthetics', 'lighting', 'medium', 'art_style', 'color_palette']
    : ['aesthetics', 'lighting', 'photo', 'medium', 'color_palette']

  return orderedObject(value, preferredKeys)
}

function orderedIdeogramPrompt(value: Record<string, unknown>) {
  return orderedObject(value, [
    'high_level_description',
    'style_description',
    'compositional_deconstruction',
  ])
}

function applyStylePresetToJsonPrompt(
  promptObject: Record<string, unknown>,
  stylePreset: ModelStylePreset | null,
) {
  if (!stylePreset) return orderedIdeogramPrompt(promptObject)

  const stylePrompt = stylePromptText(stylePreset)
  const presetStyle = stylePreset.styleDescription
  if (!presetStyle && !stylePrompt) return orderedIdeogramPrompt(promptObject)

  const existingStyle = getBodyObject(promptObject.style_description) || {}
  const nextStyleDescription: Record<string, unknown> = {
    ...(presetStyle || {}),
    ...existingStyle,
  }

  if (
    stylePrompt &&
    nextStyleDescription.aesthetics === undefined &&
    nextStyleDescription.art_style === undefined &&
    nextStyleDescription.photo === undefined
  ) {
    nextStyleDescription.aesthetics = stylePrompt
  }

  return orderedIdeogramPrompt({
    ...promptObject,
    style_description: orderedStyleDescription(nextStyleDescription),
  })
}

function ideogramJsonPrompt(prompt: string, stylePreset: ModelStylePreset | null) {
  const parsedPrompt = parseJsonObject(prompt)
  if (parsedPrompt) return JSON.stringify(applyStylePresetToJsonPrompt(parsedPrompt, stylePreset))

  const promptObject = {
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
  }

  return JSON.stringify(applyStylePresetToJsonPrompt(promptObject, stylePreset))
}

function upstreamPrompt(
  prompt: string,
  format: PromptFormat,
  stylePreset: ModelStylePreset | null,
): { format: PromptFormat; prompt: string } {
  if (format === 'text') return { format: 'text', prompt: styleInstruction(prompt, stylePreset) }
  return { format: 'ideogram-json', prompt: ideogramJsonPrompt(prompt, stylePreset) }
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

function requestedStylePreset(profile: ModelProfile, value: unknown): RequestedValue<ModelStylePreset | null> {
  if (profile.stylePresets.length === 0) {
    if (value === undefined || value === null || value === '') return { ok: true, value: null }

    return {
      ok: false,
      error: 'Style preset is not supported by the active model profile.',
    }
  }

  const selected = requestedAllowedValue(
    'Style preset',
    value,
    profile.stylePresets.map((stylePreset) => stylePreset.value),
    profile.defaultStylePreset || profile.stylePresets[0].value,
  )
  if (!selected.ok) return selected

  return {
    ok: true,
    value: profile.stylePresets.find((stylePreset) => stylePreset.value === selected.value) || null,
  }
}

function controlsResponse(profile: ModelProfile) {
  return {
    count: {
      values: Array.from({ length: MAX_IMAGES }, (_, index) => index + 1),
      default: 1,
    },
    presets: profile.presets,
    defaultPreset: profile.defaultPreset,
    stylePresets: profile.stylePresets.map(({ value, label }) => ({ value, label })),
    defaultStylePreset: profile.defaultStylePreset,
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

  const stylePreset = requestedStylePreset(profile, body.stylePreset)
  if (!stylePreset.ok) return Response.json({ error: stylePreset.error }, { status: 400 })

  const size = requestedAllowedValue('Size', body.size, profile.sizes, profile.defaultSize)
  if (!size.ok) return Response.json({ error: size.error }, { status: 400 })

  const requestedSeed = optionalSeed(body.seed)
  if (requestedSeed.error) return Response.json({ error: requestedSeed.error }, { status: 400 })

  const seed = requestedSeed.value ?? profile.defaultSeed
  const generatedPrompt = upstreamPrompt(prompt, profile.promptFormat, stylePreset.value)
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
        stylePreset: stylePreset.value?.value ?? null,
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
