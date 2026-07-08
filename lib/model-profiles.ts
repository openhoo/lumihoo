const DEFAULT_SGLANG_BASE_URL = 'http://localhost:30010/v1'
const DEFAULT_MODEL = 'ideogram-ai/ideogram-4-nf4'
const DEFAULT_PRESET = 'V4_DEFAULT_20'
const DEFAULT_SIZE = '1024x1024'
const DEFAULT_STYLE_PRESET = 'natural'
const DEFAULT_TIMEOUT_MS = 110_000
const DEFAULT_API_KEY_ENV = 'SGLANG_API_KEY'

const LEGACY_PRESETS = [
  { value: 'V4_TURBO_12', label: 'Turbo' },
  { value: 'V4_DEFAULT_20', label: 'Balanced' },
  { value: 'V4_QUALITY_48', label: 'Quality' },
] as const

const LEGACY_SIZES = ['1024x1024', '2048x2048'] as const
const PROMPT_FORMATS = ['text', 'ideogram-json'] as const
const DEFAULT_STYLE_PRESETS = [
  {
    value: 'natural',
    label: 'Natural',
    prompt: '',
  },
  {
    value: 'photoreal',
    label: 'Photoreal',
    prompt:
      'Photorealistic editorial image with believable materials, natural lens rendering, soft directional lighting, restrained color grading, and high-detail 2K finish.',
    styleDescription: {
      aesthetics: 'photorealistic, editorial, natural, premium',
      lighting: 'soft directional natural light with realistic shadows',
      photo: '50mm lens, balanced exposure, crisp texture detail',
      medium: 'photograph',
      color_palette: ['#F7F3EA', '#D8C7A2', '#6E6259', '#2F3136', '#A77C48'],
    },
  },
  {
    value: 'cinematic',
    label: 'Cinematic',
    prompt:
      'Cinematic frame with motivated film lighting, atmospheric depth, rich contrast, subtle grain, and composed framing like a still from a prestige feature film.',
    styleDescription: {
      aesthetics: 'cinematic, dramatic, atmospheric, refined',
      lighting: 'motivated film lighting with rim light, soft haze, and controlled contrast',
      photo: '35mm anamorphic feel, shallow depth of field, subtle film grain',
      medium: 'photograph',
      color_palette: ['#0E1116', '#273043', '#C47F3A', '#E7DCC8', '#7A8CA6'],
    },
  },
  {
    value: 'graphic-poster',
    label: 'Poster',
    prompt:
      'Bold graphic poster treatment with clear hierarchy, readable typography when text is requested, limited spot colors, print grain, and balanced negative space.',
    styleDescription: {
      aesthetics: 'bold, graphic, high contrast, readable',
      lighting: 'flat even print lighting',
      medium: 'graphic_design',
      art_style: 'screenprint poster, bold display type, limited spot-color palette, subtle paper grain',
      color_palette: ['#101114', '#F4EEE0', '#E34F35', '#1D8A99', '#F2B84B'],
    },
  },
  {
    value: 'studio-product',
    label: 'Product',
    prompt:
      'Clean commercial product or brand image with crisp surfaces, generous negative space, polished studio lighting, and readable labels when text is requested.',
    styleDescription: {
      aesthetics: 'clean, premium, minimal, commercial',
      lighting: 'soft diffuse studio lighting with a controlled shadow beneath the subject',
      photo: '70mm product photography, f/8, even exposure, crisp detail',
      medium: 'photograph',
      color_palette: ['#FFFFFF', '#F2F4F7', '#20242A', '#A7B0BA', '#D8A75F'],
    },
  },
  {
    value: 'isometric-3d',
    label: '3D Icon',
    prompt:
      'Polished isometric 3D illustration with rounded forms, tactile materials, soft ambient occlusion, simple composition, and friendly object readability.',
    styleDescription: {
      aesthetics: 'playful, polished, tactile, clean',
      lighting: 'soft studio lighting with ambient occlusion and gentle shadows',
      medium: '3d_render',
      art_style: 'isometric 3D icon, rounded geometry, clay-render finish, clean silhouette',
      color_palette: ['#F8F6F0', '#7BC6A4', '#F4A261', '#3D5A80', '#293241'],
    },
  },
] as const
const RESERVED_EXTRA_BODY_KEYS = new Set([
  'model',
  'prompt',
  'n',
  'size',
  'response_format',
  'preset',
  'seed',
])

type JsonObject = Record<string, unknown>

export type PromptFormat = (typeof PROMPT_FORMATS)[number]

export type ModelPreset = {
  value: string
  label: string
}

export type ModelStylePreset = {
  value: string
  label: string
  prompt: string
  styleDescription?: JsonObject
}

export type ModelProfile = {
  id: string
  label: string
  baseUrl: string
  apiKey: string
  model: string
  promptFormat: PromptFormat
  timeoutMs: number
  sizes: string[]
  defaultSize: string
  presets: ModelPreset[]
  defaultPreset: string | null
  stylePresets: ModelStylePreset[]
  defaultStylePreset: string | null
  defaultSeed?: number
  extraBody: JsonObject
}

export class ModelProfileConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelProfileConfigError'
  }
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function booleanEnv(value: string | undefined) {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return undefined
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return undefined
}

function normalizeBaseUrl(value: string | undefined) {
  const trimmed = (value || DEFAULT_SGLANG_BASE_URL).trim().replace(/\/+$/, '')
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`
}

function envTimeoutMs() {
  const value = Number(process.env.SGLANG_TIMEOUT_MS)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(value, 1_000), 300_000)
}

function configTimeoutMs(value: unknown, fallback: number, profileId: string) {
  if (value === undefined || value === null || value === '') return fallback

  const timeoutMs = Number(value)
  if (Number.isInteger(timeoutMs) && timeoutMs >= 1_000 && timeoutMs <= 300_000) {
    return timeoutMs
  }

  throw new ModelProfileConfigError(
    `Model profile "${profileId}" timeoutMs must be an integer between 1000 and 300000.`,
  )
}

function optionalSeed(value: unknown, name: string) {
  if (value === undefined || value === null || value === '') return undefined

  const seed = Number(value)
  if (Number.isSafeInteger(seed) && seed >= 0) return seed

  throw new ModelProfileConfigError(`${name} must be a non-negative integer.`)
}

function inferPromptFormat(model: string, envOverride: boolean | undefined) {
  if (envOverride !== undefined) return envOverride ? 'ideogram-json' : 'text'

  const normalizedModel = model.toLowerCase()
  return normalizedModel.includes('ideogram') && normalizedModel.includes('4')
    ? 'ideogram-json'
    : 'text'
}

function allowedLegacyValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
) {
  return typeof value === 'string' && allowed.includes(value as T[number])
    ? value
    : fallback
}

function validateStringList(value: unknown, fallback: readonly string[], profileId: string, name: string) {
  const raw = value === undefined ? fallback : value
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ModelProfileConfigError(`Model profile "${profileId}" ${name} must be a non-empty array.`)
  }

  const values = raw.map((item) => nonEmptyString(item))
  if (values.some((item) => !item)) {
    throw new ModelProfileConfigError(`Model profile "${profileId}" ${name} must contain only non-empty strings.`)
  }

  const uniqueValues = new Set(values)
  if (uniqueValues.size !== values.length) {
    throw new ModelProfileConfigError(`Model profile "${profileId}" ${name} must not contain duplicates.`)
  }

  return values as string[]
}

function validatePresets(value: unknown, profileId: string) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw new ModelProfileConfigError(`Model profile "${profileId}" presets must be an array.`)
  }

  const presets = value.map((item, index) => {
    if (!isRecord(item)) {
      throw new ModelProfileConfigError(`Model profile "${profileId}" preset ${index + 1} must be an object.`)
    }

    const presetValue = nonEmptyString(item.value)
    if (!presetValue) {
      throw new ModelProfileConfigError(`Model profile "${profileId}" preset ${index + 1} needs a value.`)
    }

    return {
      value: presetValue,
      label: nonEmptyString(item.label) || presetValue,
    }
  })

  const values = new Set(presets.map((preset) => preset.value))
  if (values.size !== presets.length) {
    throw new ModelProfileConfigError(`Model profile "${profileId}" presets must not contain duplicate values.`)
  }

  return presets
}

function validateStylePresets(value: unknown, profileId: string) {
  const raw = value === undefined ? DEFAULT_STYLE_PRESETS : value
  if (raw === null) return []
  if (!Array.isArray(raw)) {
    throw new ModelProfileConfigError(`Model profile "${profileId}" stylePresets must be an array.`)
  }

  const stylePresets = raw.map((item, index) => {
    if (!isRecord(item)) {
      throw new ModelProfileConfigError(`Model profile "${profileId}" style preset ${index + 1} must be an object.`)
    }

    const styleValue = nonEmptyString(item.value)
    if (!styleValue) {
      throw new ModelProfileConfigError(`Model profile "${profileId}" style preset ${index + 1} needs a value.`)
    }

    const styleDescription = item.styleDescription
    if (styleDescription !== undefined && styleDescription !== null && !isRecord(styleDescription)) {
      throw new ModelProfileConfigError(
        `Model profile "${profileId}" style preset "${styleValue}" styleDescription must be an object.`,
      )
    }

    return {
      value: styleValue,
      label: nonEmptyString(item.label) || styleValue,
      prompt: typeof item.prompt === 'string' ? item.prompt.trim() : '',
      ...(isRecord(styleDescription) ? { styleDescription } : {}),
    }
  })

  const values = new Set(stylePresets.map((stylePreset) => stylePreset.value))
  if (values.size !== stylePresets.length) {
    throw new ModelProfileConfigError(`Model profile "${profileId}" stylePresets must not contain duplicate values.`)
  }

  return stylePresets
}

function validateDefaultValue(
  value: unknown,
  allowed: readonly string[],
  fallback: string,
  profileId: string,
  name: string,
) {
  const defaultValue = nonEmptyString(value) || fallback
  if (allowed.includes(defaultValue)) return defaultValue

  throw new ModelProfileConfigError(
    `Model profile "${profileId}" ${name} must be one of: ${allowed.join(', ')}.`,
  )
}

function validateDefaultPreset(value: unknown, presets: ModelPreset[], profileId: string) {
  if (presets.length === 0) {
    if (value === undefined || value === null || value === '') return null
    throw new ModelProfileConfigError(
      `Model profile "${profileId}" defaultPreset cannot be set when presets is empty.`,
    )
  }

  return validateDefaultValue(
    value,
    presets.map((preset) => preset.value),
    presets[0].value,
    profileId,
    'defaultPreset',
  )
}

function validateDefaultStylePreset(value: unknown, stylePresets: ModelStylePreset[], profileId: string) {
  if (stylePresets.length === 0) {
    if (value === undefined || value === null || value === '') return null
    throw new ModelProfileConfigError(
      `Model profile "${profileId}" defaultStylePreset cannot be set when stylePresets is empty.`,
    )
  }

  return validateDefaultValue(
    value,
    stylePresets.map((stylePreset) => stylePreset.value),
    stylePresets.some((stylePreset) => stylePreset.value === DEFAULT_STYLE_PRESET)
      ? DEFAULT_STYLE_PRESET
      : stylePresets[0].value,
    profileId,
    'defaultStylePreset',
  )
}

function validateExtraBody(value: unknown, profileId: string) {
  if (value === undefined || value === null) return {}
  if (!isRecord(value)) {
    throw new ModelProfileConfigError(`Model profile "${profileId}" extraBody must be an object.`)
  }

  for (const key of Object.keys(value)) {
    if (RESERVED_EXTRA_BODY_KEYS.has(key)) {
      throw new ModelProfileConfigError(
        `Model profile "${profileId}" extraBody cannot define reserved key "${key}".`,
      )
    }
  }

  return value
}

function apiKeyFromEnv(envName: string) {
  return process.env[envName]?.trim() || 'EMPTY'
}

function legacyProfile(): ModelProfile {
  const model = process.env.SGLANG_IMAGE_MODEL?.trim() || DEFAULT_MODEL
  const sizes = [...LEGACY_SIZES]
  const presets = LEGACY_PRESETS.map((preset) => ({ ...preset }))
  const stylePresets = validateStylePresets(undefined, 'legacy')

  return {
    id: 'legacy',
    label: 'Legacy SGLang image model',
    baseUrl: normalizeBaseUrl(process.env.SGLANG_BASE_URL),
    apiKey: apiKeyFromEnv(DEFAULT_API_KEY_ENV),
    model,
    promptFormat: inferPromptFormat(model, booleanEnv(process.env.IDEOGRAM_JSON_PROMPT)),
    timeoutMs: envTimeoutMs(),
    sizes,
    defaultSize: allowedLegacyValue(process.env.IDEOGRAM_SIZE, LEGACY_SIZES, DEFAULT_SIZE),
    presets,
    defaultPreset: allowedLegacyValue(process.env.IDEOGRAM_PRESET, LEGACY_PRESETS.map((preset) => preset.value), DEFAULT_PRESET),
    stylePresets,
    defaultStylePreset: validateDefaultStylePreset(process.env.LUMIHOO_STYLE_PRESET, stylePresets, 'legacy'),
    defaultSeed: optionalSeed(process.env.IDEOGRAM_SEED, 'IDEOGRAM_SEED'),
    extraBody: {},
  }
}

function validatePromptFormat(value: unknown, model: string, profileId: string) {
  const promptFormat = nonEmptyString(value)
  if (!promptFormat || promptFormat === 'auto') return inferPromptFormat(model, undefined)
  if ((PROMPT_FORMATS as readonly string[]).includes(promptFormat)) return promptFormat as PromptFormat

  throw new ModelProfileConfigError(
    `Model profile "${profileId}" promptFormat must be one of: text, ideogram-json, auto.`,
  )
}

function profileFromConfig(value: unknown): ModelProfile {
  if (!isRecord(value)) {
    throw new ModelProfileConfigError('Each model profile must be an object.')
  }

  const id = nonEmptyString(value.id)
  if (!id) throw new ModelProfileConfigError('Each model profile needs a non-empty id.')

  const model = nonEmptyString(value.model)
  if (!model) throw new ModelProfileConfigError(`Model profile "${id}" needs a non-empty model.`)

  const sizes = validateStringList(value.sizes, LEGACY_SIZES, id, 'sizes')
  const presets = validatePresets(value.presets, id)
  const stylePresets = validateStylePresets(value.stylePresets, id)
  const apiKeyEnv = nonEmptyString(value.apiKeyEnv) || DEFAULT_API_KEY_ENV

  return {
    id,
    label: nonEmptyString(value.label) || id,
    baseUrl: normalizeBaseUrl(nonEmptyString(value.baseUrl) || process.env.SGLANG_BASE_URL),
    apiKey: apiKeyFromEnv(apiKeyEnv),
    model,
    promptFormat: validatePromptFormat(value.promptFormat, model, id),
    timeoutMs: configTimeoutMs(value.timeoutMs, envTimeoutMs(), id),
    sizes,
    defaultSize: validateDefaultValue(value.defaultSize, sizes, sizes[0], id, 'defaultSize'),
    presets,
    defaultPreset: validateDefaultPreset(value.defaultPreset, presets, id),
    stylePresets,
    defaultStylePreset: validateDefaultStylePreset(value.defaultStylePreset, stylePresets, id),
    defaultSeed: optionalSeed(value.defaultSeed, `Model profile "${id}" defaultSeed`),
    extraBody: validateExtraBody(value.extraBody, id),
  }
}

export function getActiveModelProfile(): ModelProfile {
  const rawConfig = process.env.LUMIHOO_MODEL_PROFILES?.trim()
  if (!rawConfig) return legacyProfile()

  let parsed: unknown
  try {
    parsed = JSON.parse(rawConfig)
  } catch {
    throw new ModelProfileConfigError('LUMIHOO_MODEL_PROFILES must be valid JSON.')
  }

  if (!isRecord(parsed)) {
    throw new ModelProfileConfigError('LUMIHOO_MODEL_PROFILES must be a JSON object.')
  }

  const rawProfiles = parsed.profiles
  if (!Array.isArray(rawProfiles) || rawProfiles.length === 0) {
    throw new ModelProfileConfigError('LUMIHOO_MODEL_PROFILES.profiles must be a non-empty array.')
  }

  const profiles = rawProfiles.map(profileFromConfig)
  const ids = new Set(profiles.map((profile) => profile.id))
  if (ids.size !== profiles.length) {
    throw new ModelProfileConfigError('LUMIHOO_MODEL_PROFILES profiles must not contain duplicate ids.')
  }

  const activeProfile = nonEmptyString(process.env.LUMIHOO_MODEL_PROFILE)
    || nonEmptyString(parsed.activeProfile)
    || profiles[0].id
  const profile = profiles.find((item) => item.id === activeProfile)
  if (!profile) {
    throw new ModelProfileConfigError(`Active model profile "${activeProfile}" was not found.`)
  }

  return profile
}

export function sizeLabel(size: string) {
  const [width, height] = size.split('x')
  return width && width === height ? width : size
}
