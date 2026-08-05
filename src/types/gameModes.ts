import type React from 'react'

export type ModeCategory = 'parts' | 'frames' | 'quantitative' | 'minimal'

export type ModeBehavior =
  | 'additive' // parts appear on wrong guess (classic hangman)
  | 'subtractive' // parts disappear on wrong guess (disappearing man)
  | 'depletion' // pool of instances shrinks on wrong guess (balloons popping)
  | 'accumulation' // instances accumulate on wrong guess
  | 'none' // no visual to react to wrong guesses at all

export interface GameMode {
  id: string
  label: string
  description: string
  category: ModeCategory
  behavior: ModeBehavior
  maxMistakes: number
  // When false, Game skips reserving space for a Visual entirely and enlarges the letter
  // display to fill it instead — Visual is still needed for the mode-picker preview card.
  hasVisual?: boolean
  // Curated out of the mode picker (see ModeSelector's VISIBLE_MODES) without deleting the mode
  // itself — it stays fully resolvable everywhere else (a shared puzzle link naming it by id, the
  // Mode Master achievement's own history) so nothing that already used it breaks.
  hidden?: boolean
  Visual: React.ComponentType<{ mistakes: number; color: string; width: number; height: number }>
}
