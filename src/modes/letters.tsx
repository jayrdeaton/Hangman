import Svg, { G } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { glyphWidth, SketchLetter } from './shared/sketchLetter'
import { DRAW_MS, SketchLine } from './shared/sketchShapes'

// HANGMAN, Home's hero title (Jay, 2026-10-18: it drew "AB", two letters to show the hand-drawn
// alphabet off), over a row of blanks: the blanks are this art's gallows (Jay: the letters render in
// place of them, as on the board), so they sketch in first, one after another, and stay under the
// letters, which then write themselves in. Every blank the same width, as on the board: one cell per
// letter, as wide as the widest letter, each letter centered in its cell. Sized to the largest letter
// height whose row fits the scene's width, its gaps and strokes scaled with it.
const PREVIEW_LETTERS = 'HANGMAN'.split('')
const PREVIEW_MAX_HEIGHT = 55
const PREVIEW_WIDTH = 90
const CELL_GAP_RATIO = 4 / 55
const STROKE_RATIO = 4 / 55
// How far under a letter its blank sits, and how much of a cell the blank spans (SketchWord's
// BLANK_MARK_FILL is 0.55 of a wider cell; a cell here is only as wide as its widest letter).
const BLANK_DROP_RATIO = 0.3
const BLANK_FILL = 0.8
// The board's own blank stagger (SketchWord), then the hero title's pace for the letters.
const BLANK_STAGGER_MS = 90
const LETTER_STAGGER_MS = 120
const LETTERS_START_MS = PREVIEW_LETTERS.length * BLANK_STAGGER_MS + DRAW_MS

const cellWidthAt = (height: number) => Math.max(...PREVIEW_LETTERS.map((letter) => glyphWidth(letter, height)))
const rowWidthAt = (height: number) => PREVIEW_LETTERS.length * cellWidthAt(height) + (PREVIEW_LETTERS.length - 1) * height * CELL_GAP_RATIO
const PREVIEW_HEIGHT = Math.min(PREVIEW_MAX_HEIGHT, (PREVIEW_MAX_HEIGHT * PREVIEW_WIDTH) / rowWidthAt(PREVIEW_MAX_HEIGHT))
const CELL_WIDTH = cellWidthAt(PREVIEW_HEIGHT)
const CELL_GAP = PREVIEW_HEIGHT * CELL_GAP_RATIO
const STROKE = Math.max(1.5, PREVIEW_HEIGHT * STROKE_RATIO)
const BLANK_DROP = PREVIEW_HEIGHT * BLANK_DROP_RATIO

// Never actually rendered during play - Game skips it for hasVisual: false modes - this only
// illustrates the mode in the pickers' previews, which is exactly why this is the one place
// safe to lean all the way into SketchLetter: nothing here depends on real puzzle text or layout
// measurement, unlike Keyboard.tsx/PuzzleStage.tsx's own use of the same primitive.
const LettersVisual = ({ color }: { mistakes: number; color: string }) => {
  const rowWidth = PREVIEW_LETTERS.length * CELL_WIDTH + (PREVIEW_LETTERS.length - 1) * CELL_GAP
  const startX = (100 - rowWidth) / 2
  // The letters and the blanks under them, centered as one block.
  const top = (100 - (PREVIEW_HEIGHT + BLANK_DROP)) / 2
  const blankY = top + PREVIEW_HEIGHT + BLANK_DROP
  const blankInset = (CELL_WIDTH * (1 - BLANK_FILL)) / 2
  return (
    <Svg viewBox='0 0 100 100'>
      {PREVIEW_LETTERS.map((letter, i) => {
        const cellX = startX + i * (CELL_WIDTH + CELL_GAP)
        const letterWidth = glyphWidth(letter, PREVIEW_HEIGHT)
        // By position: HANGMAN has two of A and of N.
        return (
          <G key={i}>
            <SketchLine x1={cellX + blankInset} y1={blankY} x2={cellX + CELL_WIDTH - blankInset} y2={blankY} color={color} strokeWidth={STROKE} delayMs={i * BLANK_STAGGER_MS} />
            <SketchLetter letter={letter} x={cellX + (CELL_WIDTH - letterWidth) / 2} y={top} height={PREVIEW_HEIGHT} color={color} strokeWidth={STROKE} delayMs={LETTERS_START_MS + i * LETTER_STAGGER_MS} />
          </G>
        )
      })}
    </Svg>
  )
}

export const lettersMode: GameMode = {
  id: 'letters',
  label: 'Letters Only',
  description: 'No artwork, just the letters, bigger',
  category: 'minimal',
  behavior: 'none',
  maxMistakes: 6,
  hasVisual: false,
  Visual: LettersVisual
}
