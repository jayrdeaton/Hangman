import { createContext, useContext } from 'react'

import { DEFAULT_MODE } from '@/modes/registry'
import type { GameMode } from '@/types/gameModes'
import type { PuzzleDifficultyTier } from '@/utils/puzzleCatalog'

export type PuzzleDefaultsContextType = {
  mode: GameMode
  setMode: (mode: GameMode) => void
  difficulty: 'any' | PuzzleDifficultyTier
  setDifficulty: (difficulty: 'any' | PuzzleDifficultyTier) => void
  // True once the persisted values (if any) have been read back from storage - mode/difficulty
  // are only the DEFAULT_MODE/'any' fallback until then. The game screen waits for this before
  // drawing a puzzle (see SoloRound in GameScreen.tsx), so a draw never uses that fallback.
  ready: boolean
}

export const PuzzleDefaultsContext = createContext<PuzzleDefaultsContextType>({
  mode: DEFAULT_MODE,
  setMode: () => {},
  difficulty: 'any',
  setDifficulty: () => {},
  ready: false
})

export const usePuzzleDefaults = () => useContext(PuzzleDefaultsContext)
