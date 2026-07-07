'use client'

import { useEffect, useRef } from 'react'

type Star = {
  x: number // 0..1 relative
  y: number
  r: number
  phase: number
  speed: number
}

type Firefly = {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  phase: number
  speed: number
}

type ShootingStar = {
  x: number
  y: number
  vx: number
  vy: number
  life: number // 0..1
}

/**
 * Owl constellation, in relative coords (0..1 within its bounding box).
 * Head outline with ear tufts, plus two eye stars.
 */
const OWL_POINTS: [number, number][] = [
  [0.18, 0.32], // left tuft tip
  [0.3, 0.18],
  [0.42, 0.3], // brow dip
  [0.58, 0.3],
  [0.7, 0.18],
  [0.82, 0.32], // right tuft tip
  [0.86, 0.62],
  [0.68, 0.88],
  [0.5, 0.94], // chin
  [0.32, 0.88],
  [0.14, 0.62],
]
const OWL_EYES: [number, number][] = [
  [0.36, 0.52],
  [0.64, 0.52],
]

export function NightSky() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let stars: Star[] = []
    let flies: Firefly[] = []
    let shooting: ShootingStar | null = null
    let nextShootAt = performance.now() + 4000 + Math.random() * 6000
    const mouse = { x: -1, y: -1 }
    let dpr = 1

    const resize = () => {
      dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr

      const starCount = Math.min(Math.floor(window.innerWidth / 9), 160)
      stars = Array.from({ length: starCount }, () => ({
        x: Math.random(),
        y: Math.random() * 0.85,
        r: (Math.random() * 0.9 + 0.4) * dpr,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.012 + 0.003,
      }))

      const flyCount = Math.min(Math.floor(window.innerWidth / 60), 24)
      flies = Array.from({ length: flyCount }, () => ({
        x: Math.random() * canvas.width,
        y: canvas.height * (0.45 + Math.random() * 0.55),
        r: (Math.random() * 1.6 + 0.7) * dpr,
        vx: (Math.random() - 0.5) * 0.25 * dpr,
        vy: (Math.random() - 0.5) * 0.2 * dpr,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.015 + 0.005,
      }))
    }

    const onMouse = (e: MouseEvent) => {
      mouse.x = e.clientX * dpr
      mouse.y = e.clientY * dpr
    }

    // Owl constellation bounding box: upper-left sky region
    const owlBox = () => {
      const size = Math.min(canvas.width, canvas.height) * 0.28
      return { x: canvas.width * 0.08, y: canvas.height * 0.08, size }
    }

    const drawOwl = (t: number) => {
      const { x, y, size } = owlBox()
      const pts = OWL_POINTS.map(([px, py]) => [x + px * size, y + py * size] as const)

      // constellation lines, very faint
      ctx.strokeStyle = 'rgba(226, 186, 120, 0.07)'
      ctx.lineWidth = 1 * dpr
      ctx.beginPath()
      pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)))
      ctx.closePath()
      ctx.stroke()

      // vertex stars
      for (const [px, py] of pts) {
        ctx.beginPath()
        ctx.arc(px, py, 1.1 * dpr, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(226, 186, 120, 0.35)'
        ctx.fill()
      }

      // eyes: slow synchronized blink (bright, then fade out briefly)
      const blink = Math.max(0, Math.sin(t * 0.00035)) ** 6
      for (const [ex, ey] of OWL_EYES) {
        const px = x + ex * size
        const py = y + ey * size
        ctx.beginPath()
        ctx.arc(px, py, 1.8 * dpr, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(236, 200, 140, ${0.25 + blink * 0.6})`
        ctx.shadowColor = 'rgba(236, 200, 140, 0.8)'
        ctx.shadowBlur = 10 * blink * dpr
        ctx.fill()
        ctx.shadowBlur = 0
      }
    }

    const drawMoonGlow = () => {
      const mx = canvas.width * 0.88
      const my = canvas.height * 0.1
      const rOuter = Math.min(canvas.width, canvas.height) * 0.5
      const g = ctx.createRadialGradient(mx, my, 0, mx, my, rOuter)
      g.addColorStop(0, 'rgba(236, 205, 150, 0.09)')
      g.addColorStop(0.35, 'rgba(226, 186, 120, 0.035)')
      g.addColorStop(1, 'rgba(226, 186, 120, 0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // moon disc, small and soft
      const mr = Math.min(canvas.width, canvas.height) * 0.035
      ctx.beginPath()
      ctx.arc(mx, my, mr, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(238, 214, 170, 0.5)'
      ctx.shadowColor = 'rgba(238, 214, 170, 0.55)'
      ctx.shadowBlur = 30 * dpr
      ctx.fill()
      ctx.shadowBlur = 0
      // crescent shadow
      ctx.beginPath()
      ctx.arc(mx - mr * 0.38, my - mr * 0.22, mr * 0.92, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(28, 25, 20, 0.55)'
      ctx.fill()
    }

    const drawStars = () => {
      for (const s of stars) {
        s.phase += s.speed
        const tw = (Math.sin(s.phase) + 1) / 2
        ctx.beginPath()
        ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(232, 220, 200, ${0.05 + tw * 0.25})`
        ctx.fill()
      }
    }

    const drawShooting = (now: number) => {
      if (!shooting && now > nextShootAt) {
        const fromLeft = Math.random() > 0.5
        shooting = {
          x: canvas.width * (fromLeft ? 0.1 + Math.random() * 0.3 : 0.6 + Math.random() * 0.3),
          y: canvas.height * (0.05 + Math.random() * 0.25),
          vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 4) * dpr,
          vy: (2.5 + Math.random() * 2) * dpr,
          life: 1,
        }
        nextShootAt = now + 8000 + Math.random() * 14000
      }
      if (shooting) {
        shooting.x += shooting.vx
        shooting.y += shooting.vy
        shooting.life -= 0.02
        if (shooting.life <= 0) {
          shooting = null
          return
        }
        const tail = 14
        const grad = ctx.createLinearGradient(
          shooting.x,
          shooting.y,
          shooting.x - shooting.vx * tail,
          shooting.y - shooting.vy * tail,
        )
        grad.addColorStop(0, `rgba(238, 214, 170, ${0.7 * shooting.life})`)
        grad.addColorStop(1, 'rgba(238, 214, 170, 0)')
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.4 * dpr
        ctx.beginPath()
        ctx.moveTo(shooting.x, shooting.y)
        ctx.lineTo(shooting.x - shooting.vx * tail, shooting.y - shooting.vy * tail)
        ctx.stroke()
      }
    }

    const drawFireflies = () => {
      for (const f of flies) {
        // gentle attraction toward cursor
        if (mouse.x >= 0) {
          const dx = mouse.x - f.x
          const dy = mouse.y - f.y
          const dist = Math.hypot(dx, dy)
          if (dist < 260 * dpr && dist > 1) {
            f.vx += (dx / dist) * 0.012 * dpr
            f.vy += (dy / dist) * 0.012 * dpr
          }
        }
        // damping + drift
        f.vx *= 0.985
        f.vy *= 0.985
        f.x += f.vx
        f.y += f.vy
        f.phase += f.speed
        if (f.x < 0) f.x = canvas.width
        if (f.x > canvas.width) f.x = 0
        if (f.y < canvas.height * 0.3) f.vy += 0.01 * dpr
        if (f.y > canvas.height) f.y = canvas.height * 0.6

        const glow = (Math.sin(f.phase) + 1) / 2
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(226, 186, 120, ${0.06 + glow * 0.24})`
        ctx.shadowColor = 'rgba(226, 186, 120, 0.4)'
        ctx.shadowBlur = 7 * glow * dpr
        ctx.fill()
        ctx.shadowBlur = 0
      }
    }

    const frame = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      drawMoonGlow()
      drawStars()
      drawOwl(now)
      drawShooting(now)
      drawFireflies()
      raf = requestAnimationFrame(frame)
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMouse)

    if (!reduced) {
      raf = requestAnimationFrame(frame)
    } else {
      // single static render for reduced motion
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      drawMoonGlow()
      drawStars()
      drawOwl(0)
      drawFireflies()
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouse)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 h-full w-full opacity-80"
      aria-hidden="true"
    />
  )
}
