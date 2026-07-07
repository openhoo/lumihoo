'use client'

import { useState } from 'react'
import { Check, Download, Link2, Share2 } from 'lucide-react'

export function ShareActions({ src, prompt }: { src: string; prompt: string }) {
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable; ignore
    }
  }

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Lumihoo',
          text: prompt,
          url: window.location.href,
        })
        return
      } catch {
        // User cancelled or share failed; fall back to copy
      }
    }
    copyLink()
  }

  const download = () => {
    const a = document.createElement('a')
    a.href = src
    a.download = 'lumihoo-image.png'
    a.click()
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <button
        type="button"
        onClick={share}
        className="flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-all duration-300 hover:shadow-[0_0_24px_oklch(0.78_0.11_78/0.5)]"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        Share
      </button>
      <button
        type="button"
        onClick={copyLink}
        className="flex h-10 items-center gap-2 rounded-full border border-border bg-background/60 px-5 text-sm text-foreground transition-colors hover:border-primary/40"
        aria-live="polite"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 text-primary" aria-hidden="true" />
            Copied
          </>
        ) : (
          <>
            <Link2 className="h-4 w-4" aria-hidden="true" />
            Copy link
          </>
        )}
      </button>
      <button
        type="button"
        onClick={download}
        className="flex h-10 items-center gap-2 rounded-full border border-border bg-background/60 px-5 text-sm text-foreground transition-colors hover:border-primary/40"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Download
      </button>
    </div>
  )
}
