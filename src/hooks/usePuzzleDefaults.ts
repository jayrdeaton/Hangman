import { createContext, useContext } from 'react'

import { DEFAULT_MODE } from '@/modes/registry'
import type { GameMode } from '@/types/gameModes'
import type { PuzzleDifficultyTier } from '@/utils/puzzleCatalog'

// The active player's art and difficulty picks (see PuzzleDefaultsProvider): each player has their own.
export type PuzzleDefaultsContextType = {
  mode: GameMode
  setMode: (mode: GameMode) => void
  difficulty: 'any' | PuzzleDifficultyTier
  setDifficulty: (difficulty: 'any' | PuzzleDifficultyTier) => void
  // Always true under PuzzleDefaultsProvider: the picks live in redux, which has rehydrated by the time
  // anything renders (PersistGate). Only this fallback, with no provider, reads false.
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
