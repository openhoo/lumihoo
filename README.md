# Lumihoo AI Web App

Lumihoo is a polished image generation interface for OpenHoo. It lets users turn prompts into luminous generated images through an OpenAI-compatible SGLang image endpoint.

## Features

- Prompt-driven image generation with one to four outputs.
- Preset controls for quality, default, and turbo generation modes.
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
| `IDEOGRAM_PRESET` | `V4_QUALITY_48` | Default preset. Supported values: `V4_DEFAULT_20`, `V4_QUALITY_48`, `V4_TURBO_12`. |
| `IDEOGRAM_SIZE` | `1024x1024` | Default size. Supported values: `1024x1024`, `2048x2048`. |
| `IDEOGRAM_JSON_PROMPT` | auto | Whether to wrap text prompts as Ideogram 4 structured JSON captions. Defaults to enabled when `SGLANG_IMAGE_MODEL` contains `ideogram` and `4`. Set to `false` for non-Ideogram-compatible upstreams. |
| `IDEOGRAM_SEED` | unset | Optional non-negative integer seed. |
| `LUMIHOO_MODEL_PROFILES` | unset | Optional JSON object defining model profiles. When set, it replaces the legacy single-model `SGLANG_IMAGE_MODEL`/`IDEOGRAM_*` profile behavior. |
| `LUMIHOO_MODEL_PROFILE` | unset | Optional active profile id override. Defaults to `activeProfile` in `LUMIHOO_MODEL_PROFILES`, then the first configured profile. |

### Model profiles

Use `LUMIHOO_MODEL_PROFILES` when different upstream models need different request
shapes. Profiles are server-side deployment config; users do not choose models in the
UI. The active profile controls the model, endpoint, prompt format, timeout, supported
sizes, preset menu, default seed, and extra upstream request fields.

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
        { "value": "V4_QUALITY_48", "label": "Quality" },
        { "value": "V4_DEFAULT_20", "label": "Default" },
        { "value": "V4_TURBO_12", "label": "Turbo" }
      ],
      "defaultPreset": "V4_QUALITY_48",
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
      "extraBody": { "quality": "high" }
    }
  ]
}
```

Supported `promptFormat` values are `text`, `ideogram-json`, and `auto`. Profiles with
an empty `presets` array hide the preset control and omit `preset` from upstream
requests. `extraBody` cannot define reserved request keys: `model`, `prompt`, `n`,
`size`, `response_format`, `preset`, or `seed`.

Curated profile examples live in `model-profiles/`.

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
  "preset": "V4_QUALITY_48",
  "size": "1024x1024",
  "seed": 12345
}
```

The route validates prompt length, image count, active-profile preset, active-profile size, and seed before forwarding the request to the configured SGLang endpoint. For `ideogram-json` profiles, plain text prompts are converted to structured JSON captions before they are sent upstream; already-JSON prompts are passed through as minified JSON. Successful responses upload image bytes to MinIO, store metadata in Postgres, and return stable image URLs:

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
