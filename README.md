# Lumihoo AI Web App

Lumihoo is a polished image generation interface for OpenHoo. It lets users turn prompts into luminous generated images through an OpenAI-compatible SGLang image endpoint.

## Features

- Prompt-driven image generation with one to four outputs.
- Preset controls for turbo, balanced, and quality generation modes.
- Configurable style presets that are injected into upstream prompts.
- 1024 and 2048 square image sizes.
- Optional deterministic seed input.
- Result gallery, lightbox preview, image download, and share actions.
- Generated image storage in MinIO with metadata in Postgres.
- Caddy-hosted image URLs for stable sharing.
- Dark, responsive Next.js interface with production analytics enabled on Vercel.
- Standalone Docker build for self-hosted deployment.

## Tech Stack

- Next.js 16 and React 19
- TypeScript
- Tailwind CSS 4
- SGLang-compatible image generation API
- Drizzle ORM
- Postgres
- MinIO
- Caddy
- pnpm

## Requirements

- Node.js 24 or newer
- pnpm 11
- Postgres
- MinIO
- An OpenAI-compatible SGLang image generation endpoint

The app defaults to `http://localhost:30010/v1` and model `ideogram-ai/ideogram-4-nf4`.

## Configuration

Set these environment variables as needed:

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | unset | Postgres connection string used by Drizzle. |
| `MINIO_ENDPOINT` | `localhost` | MinIO endpoint hostname or URL. |
| `MINIO_PORT` | `9000` | MinIO API port. |
| `MINIO_USE_SSL` | `false` | Whether the app connects to MinIO over HTTPS. |
| `MINIO_ACCESS_KEY` | unset | MinIO access key. |
| `MINIO_SECRET_KEY` | unset | MinIO secret key. |
| `MINIO_BUCKET` | `lumihoo-images` | Bucket used for generated images. |
| `MINIO_REGION` | `us-east-1` | Region used when creating the bucket. |
| `PUBLIC_IMAGE_BASE_URL` | `/images` | Public URL prefix for stored image objects. |
| `SGLANG_BASE_URL` | `http://localhost:30010/v1` | Base URL for the SGLang OpenAI-compatible API. `/v1` is appended automatically if omitted. |
| `SGLANG_API_KEY` | `EMPTY` | Bearer token sent to the upstream endpoint. |
| `SGLANG_IMAGE_MODEL` | `ideogram-ai/ideogram-4-nf4` | Image model name passed to the upstream API. |
| `SGLANG_TIMEOUT_MS` | `110000` | Request timeout in milliseconds. Clamped between 1000 and 300000. |
| `IDEOGRAM_PRESET` | `V4_DEFAULT_20` | Default preset. Supported values: `V4_TURBO_12`, `V4_DEFAULT_20`, `V4_QUALITY_48`. |
| `IDEOGRAM_SIZE` | `1024x1024` | Default size. Supported values: `1024x1024`, `2048x2048`. |
| `IDEOGRAM_JSON_PROMPT` | auto | Whether to wrap text prompts as Ideogram 4 structured JSON captions. Defaults to enabled when `SGLANG_IMAGE_MODEL` contains `ideogram` and `4`. Set to `false` for non-Ideogram-compatible upstreams. |
| `IDEOGRAM_SEED` | unset | Optional non-negative integer seed. |
| `LUMIHOO_STYLE_PRESET` | `natural` | Default style preset for the legacy profile. Built-in values are `natural`, `photoreal`, `cinematic`, `graphic-poster`, `studio-product`, and `isometric-3d`. |
| `LUMIHOO_MODEL_PROFILES` | unset | Optional JSON object defining model profiles. When set, it replaces the legacy single-model `SGLANG_IMAGE_MODEL`/`IDEOGRAM_*` profile behavior. |
| `LUMIHOO_MODEL_PROFILE` | unset | Optional active profile id override. Defaults to `activeProfile` in `LUMIHOO_MODEL_PROFILES`, then the first configured profile. |

### Model profiles

Use `LUMIHOO_MODEL_PROFILES` when different upstream models need different request
shapes. Profiles are server-side deployment config; users do not choose models in the
UI. The active profile controls the model, endpoint, prompt format, timeout, supported
sizes, sampler preset menu, style preset menu, default seed, and extra upstream request
fields.

```json
{
  "activeProfile": "ideogram-v4",
  "profiles": [
    {
      "id": "ideogram-v4",
      "label": "Ideogram 4",
      "baseUrl": "http://localhost:30010/v1",
      "apiKeyEnv": "SGLANG_API_KEY",
      "model": "ideogram-ai/ideogram-4-nf4",
      "promptFormat": "ideogram-json",
      "timeoutMs": 110000,
      "sizes": ["1024x1024", "2048x2048"],
      "defaultSize": "1024x1024",
      "presets": [
        { "value": "V4_TURBO_12", "label": "Turbo" },
        { "value": "V4_DEFAULT_20", "label": "Balanced" },
        { "value": "V4_QUALITY_48", "label": "Quality" }
      ],
      "defaultPreset": "V4_DEFAULT_20",
      "stylePresets": [
        {
          "value": "natural",
          "label": "Natural",
          "prompt": ""
        },
        {
          "value": "brand-poster",
          "label": "Brand Poster",
          "prompt": "Bold graphic poster treatment with clear hierarchy, readable typography, limited spot colors, subtle print grain, and balanced negative space.",
          "styleDescription": {
            "aesthetics": "bold, graphic, high contrast, readable",
            "lighting": "flat even print lighting",
            "medium": "graphic_design",
            "art_style": "screenprint poster, bold display type, limited spot-color palette, subtle paper grain",
            "color_palette": ["#101114", "#F4EEE0", "#E34F35", "#1D8A99", "#F2B84B"]
          }
        }
      ],
      "defaultStylePreset": "natural",
      "extraBody": {}
    },
    {
      "id": "plain-image-model",
      "label": "Plain image model",
      "baseUrl": "http://localhost:30011/v1",
      "apiKeyEnv": "SGLANG_API_KEY",
      "model": "example/image-model",
      "promptFormat": "text",
      "sizes": ["1024x1024"],
      "defaultSize": "1024x1024",
      "presets": [],
      "stylePresets": [],
      "extraBody": { "quality": "high" }
    }
  ]
}
```

Supported `promptFormat` values are `text`, `ideogram-json`, and `auto`. Profiles with
an empty `presets` array hide the preset control and omit `preset` from upstream
requests. Profiles with an empty `stylePresets` array hide the style control. For
`ideogram-json` profiles, selected styles are merged into `style_description`; for
`text` profiles, selected styles are appended to the text prompt as a compact style
instruction. `extraBody` cannot define reserved request keys: `model`, `prompt`, `n`,
`size`, `response_format`, `preset`, or `seed`.

Curated profile examples live in `model-profiles/`.

### Ideogram 4 settings

The default Ideogram 4 profile is tuned for interactive speed without dropping to draft
quality:

| Use case | Preset | Size | Notes |
| --- | --- | --- | --- |
| Fast drafts | `V4_TURBO_12` | `1024x1024` | Lowest latency. Use for exploration when detail is less important. |
| Normal app generation | `V4_DEFAULT_20` | `1024x1024` | Recommended default. About 40% of the quality preset steps with the same guidance shape. |
| Final-quality assets | `V4_QUALITY_48` | `2048x2048` | Highest fidelity. Use when waiting longer is acceptable. |

For Ideogram 4 JSON prompts, Lumihoo keeps prompt content in the documented V4 caption
contract and sends output dimensions through the upstream `size` field. Style presets are
merged into `style_description`; user-supplied JSON prompt fields win over preset fields.

Batching is per prompt: the app sends one upstream `/images/generations` request with
`n` equal to the selected count, then stores every safe returned image. Keep this path for
same-prompt variants because it lets the backend batch the work and gives one timeout,
one error response, and one storage transaction. Split into separate requests only when
prompts, sizes, presets, or seeds differ.

#### Krea 2 Turbo

Krea 2 Turbo is the recommended Krea 2 inference profile. It uses the SGLang
OpenAI-compatible images endpoint with model `krea/Krea-2-Turbo`, plain text prompts,
8 inference steps, no preset field, and square 1k-2k output sizes.

Start SGLang:

```bash
SGLANG_CACHE_DIT_ENABLED=true sglang serve \
  --model-path krea/Krea-2-Turbo \
  --num-gpus 1 \
  --port 30000
```

Load the profile for local development:

```bash
export LUMIHOO_MODEL_PROFILES="$(tr -d '\n' < model-profiles/krea-2-turbo.json)"
export SGLANG_API_KEY=EMPTY
pnpm dev
```

For Docker Compose, edit the profile `baseUrl` to
`http://host.docker.internal:30000/v1` before setting `LUMIHOO_MODEL_PROFILES`, or run
SGLang as a Compose service on the same Docker network.

## Development

Install dependencies:

```bash
pnpm install
```

Start the development server:

```bash
pnpm dev
```

Open `http://localhost:3000`.

Run linting:

```bash
pnpm lint
```

Run the full local check:

```bash
pnpm check
```

Create a production build:

```bash
pnpm build
```

## Docker

Start the full stack:

```bash
docker compose up --build
```

Caddy serves the app at `http://localhost:8080` and proxies image objects from MinIO at
`http://localhost:8080/images/...`.

Build the app image directly:

```bash
docker build -t ghcr.io/openhoo/lumihoo:local .
```

Released images are published to GitHub Container Registry:

- `ghcr.io/openhoo/lumihoo:<version>`
- `ghcr.io/openhoo/lumihoo:<major>.<minor>`
- `ghcr.io/openhoo/lumihoo:sha-<commit>`
- `ghcr.io/openhoo/lumihoo:latest`

## Releases

Commits to `main` are linted as Conventional Commits by Hooversion. After CI passes,
the release workflow creates the release commit, tag, and GitHub release, then builds
and pushes the linux/amd64 Docker image to GHCR.

## API

`POST /api/generate` accepts JSON:

```json
{
  "prompt": "a great horned owl made of constellations",
  "count": 1,
  "preset": "V4_DEFAULT_20",
  "stylePreset": "cinematic",
  "size": "1024x1024",
  "seed": 12345
}
```

The route validates prompt length, image count, active-profile preset, active-profile
style preset, active-profile size, and seed before forwarding the request to the
configured SGLang endpoint. For `ideogram-json` profiles, plain text prompts are
converted to structured JSON captions before they are sent upstream; already-JSON
prompts are passed through as minified JSON with the selected style merged into
`style_description`. Successful responses upload image bytes to MinIO, store metadata
in Postgres, and return stable image URLs:

```json
{
  "images": ["/images/generated/2026/07/07/936e30a8-c347-4d06-84dd-5ff8ed3542ac.png"],
  "items": [
    {
      "id": "936e30a8-c347-4d06-84dd-5ff8ed3542ac",
      "prompt": "a great horned owl made of constellations",
      "src": "/images/generated/2026/07/07/936e30a8-c347-4d06-84dd-5ff8ed3542ac.png",
      "createdAt": "2026-07-07T12:00:00.000Z"
    }
  ]
}
```

Share pages use `GET /image?id=<image-id>` and load image metadata from Postgres.

## License

Apache License 2.0. See [LICENSE](LICENSE).
