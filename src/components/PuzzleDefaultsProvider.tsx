import AsyncStorage from '@react-native-async-storage/async-storage'
import { JSX, ReactNode, useCallback, useEffect, useState } from 'react'

import { PuzzleDefaultsContext } from '@/hooks/usePuzzleDefaults'
import { DEFAULT_MODE } from '@/modes/registry'
import type { GameMode } from '@/types/gameModes'
import type { PuzzleDifficultyTier } from '@/utils/puzzleCatalog'
import { findMode } from '@/utils/puzzleLink'
import { useSplashReady } from '@/utils/splashGate'

const MODE_STORAGE_KEY = 'defaultModeId'
const DIFFICULTY_STORAGE_KEY = 'defaultDifficulty'

type DifficultyFilter = 'any' | PuzzleDifficultyTier

export type PuzzleDefaultsProviderProps = { children: ReactNode }

export const PuzzleDefaultsProvider = ({ children }: PuzzleDefaultsProviderProps): JSX.Element => {
  const [mode, setModeState] = useState<GameMode>(DEFAULT_MODE)
  const [difficulty, setDifficultyState] = useState<DifficultyFilter>('any')
  // Separate from mode/difficulty themselves, same as KeyboardLayoutProvider's own layoutLoaded:
  // a saved value that happens to match the default above wouldn't change either piece of state,
  // so gating readiness on THOSE changing would leave the 'puzzleDefaults' gate (see
  // src/utils/splashGate.ts) permanently unsatisfied for anyone who'd saved the defaults.
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void Promise.all([AsyncStorage.getItem(MODE_STORAGE_KEY), AsyncStorage.getItem(DIFFICULTY_STORAGE_KEY)]).then(([storedModeId, storedDifficulty]) => {
      if (storedModeId) setModeState(findMode(storedModeId))
      if (storedDifficulty === 'any' || storedDifficulty === 'easy' || storedDifficulty === 'medium' || storedDifficulty === 'hard') setDifficultyState(storedDifficulty)
      setLoaded(true)
    })
  }, [])
  // Gated (unlike selectedPackKeys, which happily starts from an "every pack" fallback and
  // corrects a render later) because mode/difficulty are visible the instant the first round
  // draws — Main.tsx's own puzzle draw needs the real persisted values already in hand, not a
  // default that would flash and then swap a round later. See KeyboardLayoutProvider's identical
  // reasoning for the keyboard's own layout.
  useSplashReady('puzzleDefaults', loaded)

  const setMode = useCallback((next: GameMode) => {
    setModeState(next)
    void AsyncStorage.setItem(MODE_STORAGE_KEY, next.id)
  }, [])

  const setDifficulty = useCallback((next: DifficultyFilter) => {
    setDifficultyState(next)
    void AsyncStorage.setItem(DIFFICULTY_STORAGE_KEY, next)
  }, [])

  return <PuzzleDefaultsContext.Provider value={{ mode, setMode, difficulty, setDifficulty, ready: loaded }}>{children}</PuzzleDefaultsContext.Provider>
}
