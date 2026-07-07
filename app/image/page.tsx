import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { NightSky } from '@/components/night-sky'
import { OwlMark } from '@/components/owl-mark'
import { ShareActions } from '@/components/share-actions'
import { getGeneratedImageById } from '@/lib/generated-images'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ id?: string }>

async function resolveImage(id?: string) {
  if (!id) return null
  return getGeneratedImageById(id)
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams
}): Promise<Metadata> {
  const { id } = await searchParams
  const image = await resolveImage(id)
  if (!image) return { title: 'Image not found — Lumihoo' }
  return {
    title: `${image.prompt} — Lumihoo`,
    description: `"${image.prompt}" — imagined with Lumihoo by OpenHoo.`,
    openGraph: {
      title: `${image.prompt} — Lumihoo`,
      description: 'Imagined with Lumihoo by OpenHoo.',
      images: [{ url: image.src }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${image.prompt} — Lumihoo`,
      images: [image.src],
    },
  }
}

export default async function ImagePage({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams
  const image = await resolveImage(id)
  if (!image) notFound()

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <NightSky />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
          <OwlMark className="h-7 w-7 text-primary" />
          <span className="text-lg font-semibold tracking-tight">Lumihoo</span>
        </Link>
        <span className="font-mono text-xs text-muted-foreground">by OpenHoo</span>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center gap-8 px-6 pt-8 pb-24 md:pt-12">
        <figure className="animate-lumi-rise w-full">
          <div className="overflow-hidden rounded-2xl border border-border bg-card lumi-glow-ring">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.src || '/placeholder.svg'} alt={image.prompt} className="w-full object-contain" />
          </div>
          <figcaption className="mt-6 flex flex-col items-center gap-2 text-center">
            <span className="flex items-center gap-2 font-mono text-xs tracking-[0.25em] text-muted-foreground uppercase">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Imagined with Lumihoo
            </span>
            <p className="max-w-xl text-balance text-lg leading-relaxed text-foreground/90">
              {image.prompt}
            </p>
          </figcaption>
        </figure>

        <div className="animate-lumi-rise" style={{ animationDelay: '0.15s' }}>
          <ShareActions src={image.src} prompt={image.prompt} />
        </div>

        <Link
          href="/"
          className="animate-lumi-rise flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          style={{ animationDelay: '0.25s' }}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Create your own
        </Link>
      </main>
    </div>
  )
}
