import { LumihooApp } from '@/components/lumihoo-app'
import { NightSky } from '@/components/night-sky'
import { OwlMark } from '@/components/owl-mark'

export default function Page() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <NightSky />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-2.5">
          <OwlMark className="h-7 w-7 text-primary" />
          <span className="text-lg font-semibold tracking-tight">Lumihoo</span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">by OpenHoo</span>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-6 pt-16 pb-24 md:pt-24">
        <h1 className="mb-10 animate-lumi-rise text-balance text-center text-3xl font-semibold tracking-tight md:text-4xl">
          What the owl sees, <span className="text-primary">it paints.</span>
        </h1>

        <LumihooApp />
      </main>
    </div>
  )
}
