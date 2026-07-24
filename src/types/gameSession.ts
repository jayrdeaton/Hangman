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
}
