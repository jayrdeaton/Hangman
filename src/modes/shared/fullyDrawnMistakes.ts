import type { GameMode } from '@/types/gameModes'

// The mistakes count that shows a mode's own art at its fullest, most-complete state — used
// anywhere a mode needs a single representative preview frame rather than a live, mistakes-driven
// one (ModePickerDrawer's own resting/pre-focus card, PuzzleDrawer's mode summary row). Modes whose
// art gains detail as mistakes rise (a figure gaining parts, a crack spreading) peak at
// maxMistakes; every other mode starts complete and degrades toward mistakes (a figure losing
// parts, a pool of instances shrinking, a candle burning down), so its fullest form is 0.
export const fullyDrawnMistakes = (mode: Pick<GameMode, 'behavior' | 'maxMistakes'>): number => (mode.behavior === 'additive' || mode.behavior === 'accumulation' ? mode.maxMistakes : 0)
