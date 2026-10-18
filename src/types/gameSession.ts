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
  // Whether this puzzle was drawn from a single pack the player was already browsing ('single' -
  // PackPuzzlesDrawer's Play This Pack or a row tap) or from the player's whole standing pack
  // selection ('selection' - the loadout's Ready). The
  // game screen's Next (SoloRound's drawNext in GameScreen.tsx) reads this to decide whether the
  // next puzzle should stay narrowed to that one pack or draw from the full selection again - see
  // resolvePuzzle/resolveChosenPuzzle.
  packScope?: 'single' | 'selection'
}
