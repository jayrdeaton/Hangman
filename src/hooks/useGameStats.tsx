import { useAchievements } from '@tastic/achievements'
import { createContext, type JSX, type ReactNode, useCallback, useContext, useMemo } from 'react'
import { useSelector } from 'react-redux'

import { ACHIEVEMENT_CATALOG } from '@/constants/achievements'
import { achievementsActions } from '@/redux/achievementsSlice'
import type { RootState } from '@/redux/store'
import type { AchievementDefinition, StatsState } from '@/types/stats'
import { applyCustomPackCreated, applyPnpRound, applySoloRound, type SoloRound } from '@/utils/statsEngine'
import { clearPuzzleUnlocks } from '@/utils/unlocks'

// The recording side of the stats, for the round and pack flows. Each call updates the stats and
// returns whatever it just unlocked, in catalog order, so the caller can show it.
export type GameStatsActions = {
  recordSoloRound: (round: SoloRound) => AchievementDefinition[]
  recordPnpRound: (result: 'win' | 'loss', wrongGuesses: number) => AchievementDefinition[]
  recordCustomPackCreated: () => AchievementDefinition[]
  // Clears every stat and achievement and every unlocked puzzle. Confirm before calling it.
  resetAll: () => Promise<void>
}

const GameStatsContext = createContext<GameStatsActions | null>(null)

// Calls @tastic/achievements' useAchievements exactly once for the whole app (its mount re-sweeps the
// catalog against the stored stats, so this must never remount: keep it out of anything keyed or
// gated). Only the stable record callbacks go through context, so a round never hands the always-
// mounted, memoized drawers new props. The data itself is read straight from the store, narrowly
// (useUnlockedAchievementCount below) or only while on screen (StatsScreen, mounted only while open).
export const GameStatsProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const { recordOutcome, resetAll } = useAchievements<StatsState, RootState>({
    catalog: ACHIEVEMENT_CATALOG,
    select: (state) => state.achievements,
    actions: achievementsActions
  })

  const recordSoloRound = useCallback((round: SoloRound) => recordOutcome((prev) => applySoloRound(prev, round)).device, [recordOutcome])
  const recordPnpRound = useCallback((result: 'win' | 'loss', wrongGuesses: number) => recordOutcome((prev) => applyPnpRound(prev, result, wrongGuesses)).device, [recordOutcome])
  const recordCustomPackCreated = useCallback(() => recordOutcome(applyCustomPackCreated).device, [recordOutcome])
  // Solitaire's resetAllAndProgress pattern: the package only knows its own slice, and a reset that
  // left the unlocked puzzles behind would be the more surprising outcome.
  const resetAllAndProgress = useCallback(async () => {
    resetAll()
    await clearPuzzleUnlocks()
  }, [resetAll])

  const value = useMemo(() => ({ recordSoloRound, recordPnpRound, recordCustomPackCreated, resetAll: resetAllAndProgress }), [recordSoloRound, recordPnpRound, recordCustomPackCreated, resetAllAndProgress])

  return <GameStatsContext.Provider value={value}>{children}</GameStatsContext.Provider>
}

export const useGameStats = (): GameStatsActions => {
  const context = useContext(GameStatsContext)
  if (!context) throw new Error('useGameStats must be used within a GameStatsProvider')
  return context
}

// Just the count, so a reader re-renders only when it changes. Ids no longer in the catalog don't count.
export const useUnlockedAchievementCount = (): number => useSelector((state: RootState) => ACHIEVEMENT_CATALOG.filter((achievement) => achievement.id in state.achievements.unlocked).length)
