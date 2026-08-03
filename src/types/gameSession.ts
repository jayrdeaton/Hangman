import type { PuzzleDifficultyTier } from '@/utils/puzzleCatalog'

import type { GameMode } from './gameModes'

export type PuzzleSourceMode = 'random' | 'custom'

export type GameStartPayload = {
  phrase: string
  mode: GameMode
  sourceMode: PuzzleSourceMode
  hint?: string
  packKey?: string
  packLabel?: string
  puzzleId?: string
  difficultyTier?: PuzzleDifficultyTier
  // Whether this puzzle was drawn from a single pack the player was already browsing ('single' —
  // PackPuzzlesDrawer/AchievementsDrawer's own Random button or a row tap) or from the player's
  // whole standing pack selection ('selection' — PuzzleDrawer's bottom Random button). Main.tsx's
  // round-end handler reads this to decide whether the next automatic puzzle should stay narrowed
  // to that one pack or draw from the full selection again — see resolvePuzzle/resolveChosenPuzzle.
  packScope?: 'single' | 'selection'
}
