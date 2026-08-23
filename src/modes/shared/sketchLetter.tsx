import React from 'react'
import { G } from 'react-native-svg'

import { GLYPH_HEIGHT, HERSHEY_GLYPHS, type Point } from './letterformsHershey'
import { cubicBezierLength, polylineLength, SketchPath } from './sketchShapes'

// Width SketchLetter will render at for a given target height — callers that need to lay letters
// out (SketchWord.tsx, letters.tsx) use this to know how much horizontal space a specific letter
// needs before it's actually mounted. Real font data (see letterformsHershey.ts), so this varies
// per letter — an I is nowhere near as wide as an M — not a single shared ratio.
export const glyphWidth = (letter: string, height: number): number => {
  const glyph = HERSHEY_GLYPHS[letter.toUpperCase()]
  return glyph ? glyph.width * (height / GLYPH_HEIGHT) : 0
}

// Every straight stroke in letterformsHershey.ts (a stem, a crossbar, a diagonal) is exactly 2
// points, and connecting those with a straight line is correct as-is. Every ROUND stroke (S, O,
// the bowls of B/P/R/Q, the hooks of J/U, G's own curve) is ALSO just a handful of straight
// segments, digitized as a coarse approximation of a curve, not a genuinely angular shape, and
// drawn the same way reads as a faceted polygon, not a pen stroke (confirmed on screen: S in
// particular). Catmull-Rom-to-Bezier threads one smooth curve through those exact same points
// (not an approximation that drifts from the digitized shape, just a smoothed interpolation
// between its own data). This is the only place letterformsHershey.ts data ever becomes an SVG
// path, so every SketchLetter draw benefits without any caller doing anything differently.
function catmullRomPath(points: Point[]): { d: string; length: number } {
  // A 2-point stroke has no curvature to speak of, and Catmull-Rom over exactly 2 points reduces
  // to the same straight line anyway. This is a shortcut, not a different visual result.
  if (points.length < 3) {
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')
    return { d, length: polylineLength(points) }
  }
  const last = points.length - 1
  let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`
  let length = 0
  for (let i = 0; i < last; i++) {
    // Clamped at both ends (the first/last point stands in for its own missing neighbor) rather
    // than wrapping: every glyph stroke here is an open path, never a closed loop, so there's no
    // real neighbor past either end to reach for.
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(last, i + 2)]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`
    length += cubicBezierLength(p1[0], p1[1], c1x, c1y, c2x, c2y, p2[0], p2[1])
  }
  return { d, length }
}

function strokeToPath(points: Point[], x: number, y: number, scale: number): { d: string; length: number } {
  const scaled: Point[] = points.map(([px, py]) => [x + px * scale, y + py * scale])
  return catmullRomPath(scaled)
}

type SketchLetterTiming = { start?: boolean; erased?: boolean; durationMs?: number }

// Draws a single letter stroke-by-stroke from HERSHEY_GLYPHS, top-left at (x, y), scaled to
// `height` (width follows the glyph's own real proportions — see glyphWidth above). Multiple
// strokes (an A's crossbar, a T's bar and stem) draw in staggered, one after another, the same
// handoff balloons.tsx's own outline-then-fill uses, so a multi-stroke letter reads as one small
// continuous gesture instead of every stroke racing in at once.
//
// Renders nothing for any character not in HERSHEY_GLYPHS (space, punctuation, digits) —
// deliberately: every caller already has its own plain-text fallback for whatever this doesn't
// cover.
export const SketchLetter = ({
  letter,
  x,
  y,
  height,
  color,
  strokeWidth = 5,
  delayMs = 0,
  staggerMs = 90,
  ...timing
}: {
  letter: string
  x: number
  y: number
  height: number
  color: string
  strokeWidth?: number
  delayMs?: number
  staggerMs?: number
} & SketchLetterTiming) => {
  const glyph = HERSHEY_GLYPHS[letter.toUpperCase()]
  if (!glyph) return null
  const scale = height / GLYPH_HEIGHT
  return (
    <G>
      {glyph.strokes.map((stroke, i) => {
        const { d, length } = strokeToPath(stroke, x, y, scale)
        return <SketchPath key={i} d={d} length={length} color={color} strokeWidth={strokeWidth} strokeLinecap='round' strokeLinejoin='round' delayMs={delayMs + i * staggerMs} {...timing} />
      })}
    </G>
  )
}
