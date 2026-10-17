import type { UnknownAction } from '@reduxjs/toolkit'
import { createAchievementsSlice } from '@tastic/achievements'

import type { StatsState } from '@/types/stats'
import { DEFAULT_STATS, isValidStats, migrateStats } from '@/utils/statsValidation'

import { isRootRehydrate } from './rehydrate'

// The fleet's achievements slice: { stats, unlocked }, mounted as `achievements` in store.ts and
// persisted through the root persistReducer (its whitelist has to list it). A stored blob that fails
// isValidStats falls back to the defaults on rehydrate; one missing newer fields is filled in by
// migrateStats.
const { actions, reducer } = createAchievementsSlice<StatsState>({
  defaultStats: DEFAULT_STATS,
  isValidStats,
  migrateStats
})

type AchievementsState = ReturnType<typeof reducer>

const INITIAL_STATE: AchievementsState = reducer(undefined, { type: '@@hangman/achievements/init' })

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

// Stats saved before they went per player have no `profiles`. No migrations (Jay, 2026-10-17: the app
// hasn't shipped), so that blob starts fresh, its earned achievements too, along with the per-player
// puzzle unlocks, rounds and settings that started over at the same change. Kept, it would show
// Collection Complete and old solve totals next to no unlocked puzzles. A fresh object, so redux-
// persist's reconciler keeps it over the stored one (see rehydrate.ts).
const isPrePlayerBlob = (stored: unknown): boolean => isRecord(stored) && isRecord(stored.stats) && !isRecord(stored.stats.profiles)

const achievementsReducer = (state: AchievementsState | undefined, action: UnknownAction): AchievementsState => (isRootRehydrate(action) && isPrePlayerBlob(action.payload?.achievements) ? { ...INITIAL_STATE } : reducer(state, action))

export const achievementsActions = actions
export default achievementsReducer
