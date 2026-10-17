import { JSX, ReactNode, useCallback, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { useActivePlayer } from '@/hooks/useActivePlayer'
import { PuzzleDefaultsContext } from '@/hooks/usePuzzleDefaults'
import { DEFAULT_PLAYER_SETTINGS, type DifficultyFilter, playerSettingsActions } from '@/redux/playerSettingsSlice'
import type { RootState } from '@/redux/store'
import type { GameMode } from '@/types/gameModes'
import { findMode } from '@/utils/puzzleLink'

export type PuzzleDefaultsProviderProps = { children: ReactNode }

// The active player's art and difficulty, from their playerSettings entry (the defaults until they pick
// something). A change of player changes both at once. Nothing to wait for: redux has rehydrated by the
// time this renders (it sits inside PersistGate), so the art on Home's hero and a puzzle's first draw are
// both the player's from the very first frame, and `ready` is always true.
export const PuzzleDefaultsProvider = ({ children }: PuzzleDefaultsProviderProps): JSX.Element => {
  const dispatch = useDispatch()
  const { key: playerKey } = useActivePlayer()
  const modeId = useSelector((state: RootState) => state.playerSettings[playerKey]?.modeId ?? DEFAULT_PLAYER_SETTINGS.modeId)
  const difficulty = useSelector((state: RootState) => state.playerSettings[playerKey]?.difficulty ?? DEFAULT_PLAYER_SETTINGS.difficulty)
  // findMode resolves an art id that no longer exists to the default art.
  const mode = useMemo(() => findMode(modeId), [modeId])

  const setMode = useCallback((next: GameMode) => dispatch(playerSettingsActions.setMode({ playerKey, modeId: next.id })), [dispatch, playerKey])
  const setDifficulty = useCallback((next: DifficultyFilter) => dispatch(playerSettingsActions.setDifficulty({ playerKey, difficulty: next })), [dispatch, playerKey])

  // Memoized: the loadouts' memoized drawers take these values as props.
  const value = useMemo(() => ({ mode, setMode, difficulty, setDifficulty, ready: true }), [mode, setMode, difficulty, setDifficulty])

  return <PuzzleDefaultsContext.Provider value={value}>{children}</PuzzleDefaultsContext.Provider>
}
