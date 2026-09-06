import Svg from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { glyphWidth, SketchLetter } from './shared/sketchLetter'

// Two letters, not a whole word — enough to show the hand-drawn alphabet off (one straight/angular
// glyph, one round one) without needing a real puzzle behind it.
const PREVIEW_LETTERS = ['A', 'B']
const PREVIEW_HEIGHT = 55
const PREVIEW_GAP = 10
const PREVIEW_STAGGER_MS = 320

// Never actually rendered during play — Game skips it for hasVisual: false modes — this only
// illustrates the mode in the picker's preview card, which is exactly why this is the one place
// safe to lean all the way into SketchLetter: nothing here depends on real puzzle text or layout
// measurement, unlike Keyboard.tsx/PuzzleStage.tsx's own use of the same primitive.
const LettersVisual = ({ color }: { mistakes: number; color: string }) => {
  // Real per-letter widths (letterformsHershey.ts) — A and B aren't the same width, so this is a
  // running cursor, the same layout SketchWord.tsx uses for a real word, not a uniform grid.
  const widths = PREVIEW_LETTERS.map((letter) => glyphWidth(letter, PREVIEW_HEIGHT))
  const totalWidth = widths.reduce((sum, w) => sum + w, 0) + PREVIEW_GAP * (PREVIEW_LETTERS.length - 1)
  const startX = (100 - totalWidth) / 2
  const y = (100 - PREVIEW_HEIGHT) / 2
  const xs = widths.reduce<number[]>((acc, _w, i) => [...acc, i === 0 ? startX : acc[i - 1] + widths[i - 1] + PREVIEW_GAP], [])
  return (
    <Svg viewBox='0 0 100 100'>
      {PREVIEW_LETTERS.map((letter, i) => (
        <SketchLetter key={letter} letter={letter} x={xs[i]} y={y} height={PREVIEW_HEIGHT} color={color} strokeWidth={4} delayMs={i * PREVIEW_STAGGER_MS} />
      ))}
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
