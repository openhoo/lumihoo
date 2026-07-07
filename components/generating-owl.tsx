'use client'

import { useEffect, useState } from 'react'

const PHRASES = [
  'consulting the night sky…',
  'gathering moonlight…',
  'the owl is dreaming…',
  'sketching in the dark…',
  'sharpening talons of detail…',
  'almost in focus…',
]

export function GeneratingOwl({ count }: { count: number }) {
  const [phraseIndex, setPhraseIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % PHRASES.length)
    }, 2600)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex w-full flex-col items-center gap-10 animate-lumi-rise" role="status">
      {/* Owl eyes loader */}
      <div className="relative flex items-center justify-center">
        {/* orbiting spark */}
        <div className="animate-lumi-orbit absolute h-40 w-40">
          <div className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-glow shadow-[0_0_12px_2px_oklch(0.85_0.17_80/0.8)]" />
        </div>
        <div className="flex items-center gap-4">
          {[0, 1].map((eye) => (
            <div
              key={eye}
              className="animate-lumi-blink flex h-16 w-16 items-center justify-center rounded-full border border-primary/40 bg-card lumi-glow-ring"
              style={{ animationDelay: eye === 1 ? '0.12s' : '0s' }}
            >
              <div className="animate-lumi-pulse h-5 w-5 rounded-full bg-primary shadow-[0_0_20px_4px_oklch(0.82_0.16_75/0.5)]" />
            </div>
          ))}
        </div>
      </div>

      <p className="font-mono text-sm tracking-widest text-muted-foreground uppercase" aria-live="polite">
        {PHRASES[phraseIndex]}
      </p>

      {/* shimmer placeholders matching requested count */}
      <div
        className={`grid w-full max-w-3xl gap-4 ${
          count === 1 ? 'grid-cols-1 max-w-md' : count === 2 ? 'grid-cols-2' : 'grid-cols-2'
        }`}
      >
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="lumi-shimmer aspect-square rounded-xl border border-border"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
      <span className="sr-only">Generating {count} image{count > 1 ? 's' : ''}</span>
    </div>
  )
}
