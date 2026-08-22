import React from 'react'
import { G } from 'react-native-svg'

import { GLYPH_HEIGHT, HERSHEY_GLYPHS, type Point } from './letterformsHershey'
import { polylineLength, SketchPath } from './sketchShapes'

// Width SketchLetter will render at for a given target height — callers that need to lay letters
// out (SketchWord.tsx, letters.tsx) use this to know how much horizontal space a specific letter
// needs before it's actually mounted. Real font data (see letterformsHershey.ts), so this varies
// per letter — an I is nowhere near as wide as an M — not a single shared ratio.
export const glyphWidth = (letter: string, height: number): number => {
  const glyph = HERSHEY_GLYPHS[letter.toUpperCase()]
  return glyph ? glyph.width * (height / GLYPH_HEIGHT) : 0
}

function strokeToPath(points: Point[], x: number, y: number, scale: number): { d: string; length: number } {
  const scaled: Point[] = points.map(([px, py]) => [x + px * scale, y + py * scale])
  const d = scaled.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')
  return { d, length: polylineLength(scaled) }
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
