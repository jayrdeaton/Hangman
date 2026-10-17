import { broadcastDeviceUnlocks, mapUnlocksBySeat, type RecordOutcomeResult, useAchievements } from '@tastic/achievements'
import { createContext, type JSX, type ReactNode, useCallback, useContext, useMemo } from 'react'

import { ACHIEVEMENT_CATALOG } from '@/constants/achievements'
import { achievementsActions } from '@/redux/achievementsSlice'
import type { RootState } from '@/redux/store'
import type { AchievementDefinition, StatsState } from '@/types/stats'
import { applyCustomPackCreated, applyPnpRound, applySoloRound, getProfileStatsView, type PnpRoundOutcome, type SoloRound } from '@/utils/statsEngine'
import { clearAllPuzzleUnlocks } from '@/utils/unlocks'

// What a Pass & Play round unlocked, for each side of it.
export type PnpRoundUnlocks = { guesser: AchievementDefinition[]; writer: AchievementDefinition[] }

// The recording side of the stats, for the round and pack flows. Each call takes the player it belongs
// to explicitly (a profile's id, or null for the guest), never whoever happens to be active when it
// runs, updates the stats and returns what that player should be shown, in catalog order.
export type GameStatsActions = {
  recordSoloRound: (round: SoloRound, profileId: string | null) => AchievementDefinition[]
  recordPnpRound: (outcome: PnpRoundOutcome) => PnpRoundUnlocks
  recordCustomPackCreated: (profileId: string | null) => AchievementDefinition[]
  // Clears every stat and achievement, and every player's unlocked puzzles. Confirm before calling it.
  resetAll: () => Promise<void>
  // One profile's stats bucket and achievements, for when that profile is deleted. The device bucket
  // (every round played here) keeps the rounds they played, as Solitaire's does.
  removePlayerStats: (profileId: string) => void
}

const GameStatsContext = createContext<GameStatsActions | null>(null)

// Each profile's bucket as a whole StatsState, so the catalog is evaluated for every profile exactly
// as it is for the device (the package's per-profile model).
const profileViews = (stats: StatsState): Record<string, StatsState> => Object.fromEntries(Object.entries(stats.profiles).map(([profileId, bucket]) => [profileId, getProfileStatsView(bucket)]))

// The package hands back device-wide unlocks and each profile's own by profile id; these turn that into
// what each seat of a round is shown. A seat with a profile gets its own unlocks (plus any scope
// 'device' ones, of which the catalog has none); a guest seat gets the device's, since a guest's
// progress is the device's.
const SOLO_SEATS = ['player'] as const
const PNP_SEATS = ['guesser', 'writer'] as const

const seatIds = <Seat extends string>(entries: [Seat, string | null][]): Partial<Record<Seat, string>> => {
  const ids: Partial<Record<Seat, string>> = {}
  for (const [seat, profileId] of entries) if (profileId) ids[seat] = profileId
  return ids
}

const shownToSolo = (result: RecordOutcomeResult<StatsState>, profileId: string | null): AchievementDefinition[] => {
  const ids = seatIds([['player', profileId]])
  return broadcastDeviceUnlocks(SOLO_SEATS, mapUnlocksBySeat(SOLO_SEATS, ids, result.profiles), result.device, ids).player ?? []
}

// The device bucket records a Pass & Play round from the guesser's side, so its unlocks are the
// guesser's (the package's `winners`: the seats the device's unlocks go to). The writer is only shown
// their own.
const shownToPnp = (result: RecordOutcomeResult<StatsState>, outcome: PnpRoundOutcome): PnpRoundUnlocks => {
  const ids = seatIds([
    ['guesser', outcome.guesserProfileId],
    ['writer', outcome.writerProfileId]
  ])
  const shown = broadcastDeviceUnlocks(PNP_SEATS, mapUnlocksBySeat(PNP_SEATS, ids, result.profiles), result.device, ids, { winners: ['guesser'] })
  return { guesser: shown.guesser ?? [], writer: shown.writer ?? [] }
}

// Calls @tastic/achievements' useAchievements exactly once for the whole app (its mount re-sweeps the
// catalog against the stored stats, the device's and every profile's, so this must never remount: keep
// it out of anything keyed or gated). Only the stable record callbacks go through context, so a round
// never hands the always-mounted, memoized drawers new props. The data itself is read straight from
// the store, only while on screen (StatsScreen, a route).
export const GameStatsProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const { recordOutcome, resetAll, removeProfile } = useAchievements<StatsState, RootState>({
    catalog: ACHIEVEMENT_CATALOG,
    select: (state) => state.achievements,
    actions: achievementsActions,
    profileViews
  })

  const recordSoloRound = useCallback(
    (round: SoloRound, profileId: string | null) => {
      const result = recordOutcome((prev) => applySoloRound(prev, round, profileId))
      return shownToSolo(result, profileId)
    },
    [recordOutcome]
  )
  const recordPnpRound = useCallback(
    (outcome: PnpRoundOutcome) => {
      const result = recordOutcome((prev) => applyPnpRound(prev, outcome))
      return shownToPnp(result, outcome)
    },
    [recordOutcome]
  )
  const recordCustomPackCreated = useCallback(
    (profileId: string | null) => {
      const result = recordOutcome((prev) => applyCustomPackCreated(prev, profileId))
      return shownToSolo(result, profileId)
    },
    [recordOutcome]
  )
  // Solitaire's resetAllAndProgress pattern: the package only knows its own slice, and a reset that
  // left the unlocked puzzles behind would be the more surprising outcome.
  const resetAllAndProgress = useCallback(async () => {
    resetAll()
    await clearAllPuzzleUnlocks()
  }, [resetAll])
  const removePlayerStats = useCallback(
    (profileId: string) =>
      removeProfile(profileId, (prev) => {
        if (!(profileId in prev.profiles)) return prev
        const { [profileId]: _removed, ...profiles } = prev.profiles
        return { ...prev, profiles }
      }),
    [removeProfile]
  )

  const value = useMemo(() => ({ recordSoloRound, recordPnpRound, recordCustomPackCreated, resetAll: resetAllAndProgress, removePlayerStats }), [recordSoloRound, recordPnpRound, recordCustomPackCreated, resetAllAndProgress, removePlayerStats])

  return <GameStatsContext.Provider value={value}>{children}</GameStatsContext.Provider>
}

export const useGameStats = (): GameStatsActions => {
  const context = useContext(GameStatsContext)
  if (!context) throw new Error('useGameStats must be used within a GameStatsProvider')
  return context
}
