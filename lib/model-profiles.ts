const DEFAULT_SGLANG_BASE_URL = 'http://localhost:30010/v1'
const DEFAULT_MODEL = 'ideogram-ai/ideogram-4-nf4'
const DEFAULT_PRESET = 'V4_QUALITY_48'
const DEFAULT_SIZE = '1024x1024'
const DEFAULT_TIMEOUT_MS = 110_000
const DEFAULT_API_KEY_ENV = 'SGLANG_API_KEY'

const LEGACY_PRESETS = [
  { value: 'V4_DEFAULT_20', label: 'Default' },
  { value: 'V4_QUALITY_48', label: 'Quality' },
  { value: 'V4_TURBO_12', label: 'Turbo' },
] as const

const LEGACY_SIZES = ['1024x1024', '2048x2048'] as const
const PROMPT_FORMATS = ['text', 'ideogram-json'] as const
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
