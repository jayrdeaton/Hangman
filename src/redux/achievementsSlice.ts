import { createAchievementsSlice } from '@tastic/achievements'

import type { StatsState } from '@/types/stats'
import { DEFAULT_STATS, isValidStats, migrateStats } from '@/utils/statsValidation'

// The fleet's achievements slice: { stats, unlocked }, mounted as `achievements` in store.ts and
// persisted through the root persistReducer (its whitelist has to list it). A stored blob that fails
// isValidStats falls back to the defaults on rehydrate; one missing newer fields is filled in by
// migrateStats.
const { actions, reducer } = createAchievementsSlice<StatsState>({
  defaultStats: DEFAULT_STATS,
  isValidStats,
  migrateStats
})

export const achievementsActions = actions
export default reducer
