import Svg from 'react-native-svg'

import { GLYPH_HEIGHT, HERSHEY_GAP, HERSHEY_GLYPHS } from '@/modes/shared/letterformsHershey'
import { WORD_SWEEP_DELAY_MS } from '@/modes/shared/sceneReveal'
import { SketchLetter } from '@/modes/shared/sketchLetter'
import { SketchLine } from '@/modes/shared/sketchShapes'

// Every position — letter or blank — gets this same cell width, in the same GLYPH_HEIGHT-relative
// units as a glyph's own width. 110 comfortably fits the widest real letter (M/W, ~104) with a
// little breathing room either side; letters narrower than that (most of them) just sit centered
// in the leftover space, the same way a monospace font's own "I" doesn't stretch to fill an "M"'s
// advance width either. Deliberately NOT each letter's own true width: that was tried and reverted
// — it made every blank a different width depending on which letter it was hiding, which is both
// the one thing a blank must never visibly do and, it turns out, just looks inconsistent.
export const CELL_WIDTH = 110
// How much of the (now-uniform) cell a blank's dash mark fills.
const BLANK_MARK_FILL = 0.55
// Gap between one blank's own reveal starting and the next one's, matching the stagger every other
// multi-part reveal in this app uses (classicParts.tsx's GALLOWS_STAGGER_MS, balloons.tsx's own
// STAGGER_MS, ...) rather than a slower value — against SketchPath's own DRAW_MS (380), this reads
// as a few dashes drawing in close together, not a dozen scribbling in at once and not a slow
// one-at-a-time crawl either. Added on top of WORD_SWEEP_DELAY_MS (see sceneReveal.ts), which is
// the whole-screen sweep's own head start for this band, not a per-blank amount.
const BLANK_STAGGER_MS = 90
// Gap between one duplicate letter's own reveal starting and the next one's — e.g. guessing "S" in
// "KISS" reveals two positions in the same render, and without this both S's would draw in at the
// exact same instant. Only duplicates stagger against each other; a letter with no repeats in this
// word always gets delayMs 0, revealing the moment it's guessed same as before.
const DUPLICATE_LETTER_STAGGER_MS = 150

// Renders one word of the puzzle display — letters and blanks alike — as hand-drawn strokes
// instead of monospace Text. Every cell is the same CELL_WIDTH regardless of which letter (or
// blank) occupies it, so a word's layout never shifts as guesses land — the only thing that
// changes when a letter reveals is which shape draws inside its already-final-sized cell — and
// every blank's own dash mark is the same fixed length as every other blank's, full stop.
export type SketchWordProps = {
  // One entry per phrase letter — the letter itself if guessed, '_' if not.
  letters: string[]
  fontSize: number
  color: string
  // Gates the blanks' one-time reveal at round start (see classicParts.tsx's own `started`
  // convention) — NOT the letters, which reveal reactively the instant each one is guessed: a
  // letter cell only ever mounts a SketchLetter once guessedLetters includes it, so the default
  // "just mounted is just revealed" behavior already gives the right timing for free, the same way
  // robot.tsx's removable parts need no `started` gating for their own reactive reveals.
  started?: boolean
}

export const SketchWord = ({ letters, fontSize, color, started }: SketchWordProps) => {
  const height = fontSize
  const strokeWidth = Math.max(1.5, fontSize * 0.08)
  // Headroom on every edge a glyph's own path actually reaches — round strokeLinecap/
  // strokeLinejoin (see SketchLetter/sketchShapes.tsx) draws past the nominal path by up to
  // strokeWidth/2, and every letter's baseline sits flush with GLYPH_HEIGHT in letterformsHershey.ts,
  // so without this the Svg's own overflow:hidden clips that overshoot right off the bottom of any
  // letter that reaches all the way down there — which, by design, is most of them (S, U, ...).
  const glyphMargin = strokeWidth * 0.75
  const glyphHeight = Math.max(1, height - glyphMargin * 2)
  const scale = glyphHeight / GLYPH_HEIGHT
  const cellWidth = CELL_WIDTH * scale
  const gap = HERSHEY_GAP * scale
  const markWidth = cellWidth * BLANK_MARK_FILL

  const width = Math.max(1, letters.length * cellWidth + Math.max(0, letters.length - 1) * gap)

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {letters.map((ch, i) => {
        const cellX = i * (cellWidth + gap)
        if (ch === '_') {
          const y = height - strokeWidth
          const inset = (cellWidth - markWidth) / 2
          return <SketchLine key={i} x1={cellX + inset} y1={y} x2={cellX + cellWidth - inset} y2={y} color={color} strokeWidth={strokeWidth} start={started} delayMs={WORD_SWEEP_DELAY_MS + i * BLANK_STAGGER_MS} />
        }
        const letterWidth = (HERSHEY_GLYPHS[ch]?.width ?? 0) * scale
        // How many earlier positions in this same word already show this same letter — 0 for the
        // first (or only) occurrence, so a non-repeated letter is unaffected.
        const duplicateIndex = letters.slice(0, i).filter((c) => c === ch).length
        return <SketchLetter key={i} letter={ch} x={cellX + (cellWidth - letterWidth) / 2} y={glyphMargin} height={glyphHeight} color={color} strokeWidth={strokeWidth} delayMs={duplicateIndex * DUPLICATE_LETTER_STAGGER_MS} />
      })}
    </Svg>
  )
}
