'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Gauge,
  Hash,
  Images,
  Ruler,
  Share2,
  Sparkles,
  X,
} from 'lucide-react'
import { GeneratingOwl } from '@/components/generating-owl'
import { cn } from '@/lib/utils'

type GalleryItem = {
  id: string
  prompt: string
  src: string
}

type GeneratedImageItem = {
  id: string
  prompt: string
  src: string
}

const COUNTS = [1, 2, 3, 4]

const PRESET_OPTIONS = [
  { value: 'V4_QUALITY_48', label: 'Quality' },
  { value: 'V4_DEFAULT_20', label: 'Default' },
  { value: 'V4_TURBO_12', label: 'Turbo' },
] as const

const SIZE_OPTIONS = [
  { value: '1024x1024', label: '1024' },
  { value: '2048x2048', label: '2048' },
] as const

type IdeogramPreset = (typeof PRESET_OPTIONS)[number]['value']
type ImageSize = (typeof SIZE_OPTIONS)[number]['value']

export function LumihooApp() {
  const [prompt, setPrompt] = useState('')
  const [count, setCount] = useState(1)
  const [preset, setPreset] = useState<IdeogramPreset>('V4_QUALITY_48')
  const [size, setSize] = useState<ImageSize>('1024x1024')
  const [seed, setSeed] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<GalleryItem[]>([])
  const [gallery, setGallery] = useState<GalleryItem[]>([])
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const generate = useCallback(async () => {
    const trimmed = prompt.trim()
    if (!trimmed || isGenerating) return
    setIsGenerating(true)
    setError(null)
    setResults([])

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          count,
          preset,
          size,
          seed: seed.trim() ? Number(seed) : undefined,
        }),
      })
      const data = (await res.json()) as {
        images?: unknown
        items?: unknown
        error?: string
      }
      if (!res.ok) throw new Error(data.error || 'Generation failed')

      if (!Array.isArray(data.items) && !Array.isArray(data.images)) throw new Error('Generation failed')

      const rawItems: unknown[] = Array.isArray(data.items) ? data.items : []
      const rawImages: unknown[] = Array.isArray(data.images) ? data.images : []

      const items = rawItems.length > 0
        ? rawItems
            .filter(
              (item): item is GeneratedImageItem =>
                Boolean(item) &&
                typeof item === 'object' &&
                typeof (item as GeneratedImageItem).id === 'string' &&
                typeof (item as GeneratedImageItem).src === 'string',
            )
            .map((item) => ({
              id: item.id,
              prompt: typeof item.prompt === 'string' ? item.prompt : trimmed,
              src: item.src,
            }))
        : rawImages
            .filter((src): src is string => typeof src === 'string')
            .map((src, i) => ({
              id: `${Date.now()}-${i}`,
              prompt: trimmed,
              src,
            }))

      if (items.length === 0) throw new Error('Generation failed')

      setResults(items)
      setGallery((g) => [...items, ...g])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setIsGenerating(false)
    }
  }, [prompt, count, preset, size, seed, isGenerating])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return
      e.preventDefault()
      generate()
    }
  }

  const download = (item: GalleryItem) => {
    const a = document.createElement('a')
    a.href = item.src
    a.download = `lumihoo-${item.id}.png`
    a.click()
  }

  return (
    <div className="relative z-10 flex w-full flex-col items-center gap-12">
      {/* Prompt bar */}
      <section className="w-full max-w-2xl animate-lumi-rise" aria-label="Prompt input">
        <div
          className={cn(
            'rounded-2xl border border-border bg-card/80 backdrop-blur-sm transition-shadow duration-500',
            isGenerating ? 'lumi-glow-ring' : 'focus-within:lumi-glow-ring',
          )}
        >
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            maxLength={2000}
            placeholder="Describe what the owl should see…"
            disabled={isGenerating}
            className="w-full resize-none bg-transparent px-5 pt-4 text-base leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
            aria-label="Image prompt"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <CountSelector count={count} onChange={setCount} disabled={isGenerating} />
              <OptionMenu
                label="Preset"
                icon={Gauge}
                value={preset}
                options={PRESET_OPTIONS}
                onChange={setPreset}
                disabled={isGenerating}
              />
              <OptionMenu
                label="Size"
                icon={Ruler}
                value={size}
                options={SIZE_OPTIONS}
                onChange={setSize}
                disabled={isGenerating}
              />
              <SeedInput seed={seed} onChange={setSeed} disabled={isGenerating} />
            </div>
            <button
              type="button"
              onClick={generate}
              disabled={!prompt.trim() || isGenerating}
              className="group flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all duration-300 hover:shadow-[0_0_24px_oklch(0.82_0.16_75/0.5)] disabled:opacity-40 disabled:hover:shadow-none"
              aria-label="Generate images"
            >
              <ArrowUp className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-4 text-center text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </section>

      {/* Loading */}
      {isGenerating && <GeneratingOwl count={count} />}

      {/* Results */}
      {!isGenerating && results.length > 0 && (
        <section
          className={cn(
            'grid w-full gap-4',
            results.length === 1 ? 'max-w-md grid-cols-1' : 'max-w-3xl grid-cols-2',
          )}
          aria-label="Generated images"
        >
          {results.map((item, i) => (
            <ImageCard key={item.id} item={item} index={i} onDownload={download} onOpen={setLightbox} />
          ))}
        </section>
      )}

      {/* Gallery */}
      {gallery.length > 0 && (
        <GalleryCarousel gallery={gallery} onDownload={download} onOpen={setLightbox} />
      )}

      {/* Lightbox modal */}
      {lightbox && (
        <Lightbox item={lightbox} onClose={() => setLightbox(null)} onDownload={download} />
      )}
    </div>
  )
}

function SeedInput({
  seed,
  onChange,
  disabled,
}: {
  seed: string
  onChange: (seed: string) => void
  disabled?: boolean
}) {
  return (
    <label className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 text-xs text-muted-foreground transition-colors focus-within:border-primary/40 focus-within:text-foreground">
      <Hash className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">Seed</span>
      <input
        value={seed}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 12))}
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="Seed"
        disabled={disabled}
        className="h-full w-16 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        aria-label="Seed"
      />
    </label>
  )
}

function OptionMenu<T extends string>({
  label,
  icon: Icon,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  icon: LucideIcon
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className="flex h-8 min-w-24 items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{selected?.label || value}</span>
        <ChevronDown
          className={cn('ml-auto h-3 w-3 shrink-0 transition-transform duration-200', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="animate-lumi-pop absolute bottom-full left-0 z-20 mb-2 min-w-full overflow-hidden rounded-xl border border-border bg-popover/95 py-1 shadow-lg backdrop-blur-sm"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center justify-between gap-3 px-3 py-2 text-xs transition-colors',
                value === option.value
                  ? 'text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <span className="whitespace-nowrap">{option.label}</span>
              {value === option.value && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function GalleryCarousel({
  gallery,
  onDownload,
  onOpen,
}: {
  gallery: GalleryItem[]
  onDownload: (item: GalleryItem) => void
  onOpen: (item: GalleryItem) => void
}) {
  const [page, setPage] = useState(0)
  const perPage = 4
  const pageCount = Math.ceil(gallery.length / perPage)
  const safePage = Math.min(page, pageCount - 1)
  const visible = gallery.slice(safePage * perPage, safePage * perPage + perPage)

  return (
    <section className="w-full max-w-5xl" aria-label="Gallery">
      <div className="mb-5 flex items-center gap-3">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-mono text-xs tracking-[0.25em] text-muted-foreground uppercase">
          Night gallery
        </h2>
        <div className="h-px flex-1 bg-border" />
        <span className="font-mono text-xs text-muted-foreground">
          {gallery.length} {gallery.length === 1 ? 'image' : 'images'}
        </span>
        {pageCount > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background/60 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-30"
              aria-label="Previous images"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="font-mono text-xs text-muted-foreground" aria-live="polite">
              {safePage + 1}/{pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage === pageCount - 1}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background/60 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-30"
              aria-label="Next images"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <div key={safePage} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {visible.map((item, i) => (
          <ImageCard key={item.id} item={item} index={i} onDownload={onDownload} onOpen={onOpen} small />
        ))}
      </div>
    </section>
  )
}

function CountSelector({
  count,
  onChange,
  disabled,
}: {
  count: number
  onChange: (c: number) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Number of images to generate"
        className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
      >
        <Images className="h-3.5 w-3.5" aria-hidden="true" />
        <span>
          {count} {count === 1 ? 'image' : 'images'}
        </span>
        <ChevronDown
          className={cn('h-3 w-3 transition-transform duration-200', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Number of images"
          className="animate-lumi-pop absolute bottom-full left-0 z-20 mb-2 w-36 overflow-hidden rounded-xl border border-border bg-popover/95 py-1 shadow-lg backdrop-blur-sm"
        >
          {COUNTS.map((c) => (
            <button
              key={c}
              type="button"
              role="option"
              aria-selected={count === c}
              onClick={() => {
                onChange(c)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center justify-between px-3 py-2 text-xs transition-colors',
                count === c
                  ? 'text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <span>
                {c} {c === 1 ? 'image' : 'images'}
              </span>
              {count === c && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Lightbox({
  item,
  onClose,
  onDownload,
}: {
  item: GalleryItem
  onClose: () => void
  onDownload: (item: GalleryItem) => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Image: ${item.prompt}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <div className="animate-lumi-fade absolute inset-0 bg-background/85 backdrop-blur-md" />
      <div
        className="animate-lumi-rise relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.src || '/placeholder.svg'}
          alt={item.prompt}
          className="max-h-[70dvh] w-full object-contain"
        />
        <div className="flex items-center justify-between gap-4 border-t border-border p-4">
          <p className="line-clamp-2 text-sm leading-relaxed text-foreground/80">{item.prompt}</p>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={`/image?id=${encodeURIComponent(item.id)}`}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/60 text-foreground transition-colors hover:border-primary/60 hover:text-primary"
              aria-label={`Share image: ${item.prompt}`}
            >
              <Share2 className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={() => onDownload(item)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/60 text-foreground transition-colors hover:border-primary/60 hover:text-primary"
              aria-label={`Download image: ${item.prompt}`}
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/70 text-foreground backdrop-blur-sm transition-colors hover:border-primary/60 hover:text-primary"
          aria-label="Close image view"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function ImageCard({
  item,
  index,
  onDownload,
  onOpen,
  small,
}: {
  item: GalleryItem
  index: number
  onDownload: (item: GalleryItem) => void
  onOpen: (item: GalleryItem) => void
  small?: boolean
}) {
  return (
    <div
      className="group animate-lumi-rise relative overflow-hidden rounded-xl border border-border bg-card"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="block w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`View image: ${item.prompt}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.src || '/placeholder.svg'}
          alt={item.prompt}
          className="aspect-square w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
        />
      </button>
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
        <div className="flex items-end justify-between gap-2 p-3">
          {!small && (
            <p className="line-clamp-2 text-xs leading-relaxed text-foreground/80">{item.prompt}</p>
          )}
          <button
            type="button"
            onClick={() => onDownload(item)}
            className="pointer-events-auto ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card/80 text-foreground backdrop-blur-sm transition-colors hover:border-primary/60 hover:text-primary"
            aria-label={`Download image: ${item.prompt}`}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
