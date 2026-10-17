import { configureStore } from '@reduxjs/toolkit'
import { localDateString } from '@tastic/achievements'
import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { Provider as ReduxProvider } from 'react-redux'

import { GameStatsProvider, useGameStats } from '@/hooks/useGameStats'
import achievements from '@/redux/achievementsSlice'
import type { StatsState } from '@/types/stats'
import type { SoloRound } from '@/utils/statsEngine'
import { createDefaultProfileStats, createDefaultStats } from '@/utils/statsValidation'
import { clearAllPuzzleUnlocks } from '@/utils/unlocks'

jest.mock('@/utils/unlocks', () => ({
  ...jest.requireActual('@/utils/unlocks'),
  clearAllPuzzleUnlocks: jest.fn().mockResolvedValue(undefined)
}))

const mockClearAllPuzzleUnlocks = jest.mocked(clearAllPuzzleUnlocks)

const REHYDRATE = 'persist/REHYDRATE'
const record = (played: number, wins: number) => ({ played, wins, losses: played - wins, draws: 0 })
const FLAWLESS_WIN: SoloRound = { result: 'win', modeId: 'classic', wrongGuesses: 0, guessCount: 3, hintAvailable: true, hintRevealed: false, completedPackKeys: [] }

// A real store with just the achievements slice, optionally seeded the way redux-persist rehydrates
// it on launch (the payload keyed by slice name), so the slice's validator and migration run.
const makeStore = (persisted?: unknown) => {
  const store = configureStore({ reducer: { achievements } })
  if (persisted !== undefined) store.dispatch({ type: REHYDRATE, payload: { achievements: persisted } })
  return store
}

const renderGameStats = (store = makeStore()) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ReduxProvider store={store}>
      <GameStatsProvider>{children}</GameStatsProvider>
    </ReduxProvider>
  )
  return renderHook(() => useGameStats(), { wrapper }).then((utils) => ({ ...utils, store }))
}

const ids = (list: { id: string }[]) => list.map((achievement) => achievement.id)
const storedKeys = (store: ReturnType<typeof makeStore>) => Object.keys(store.getState().achievements.unlocked).sort()

describe('the achievements slice on rehydrate', () => {
  it('falls back to fresh stats when the stored ones are corrupt', () => {
    const store = makeStore({ stats: { solo: 'not a record' }, unlocked: { first_game_played: 1 } })

    expect(store.getState().achievements.stats).toEqual(createDefaultStats())
    // A valid unlock map survives on its own.
    expect(store.getState().achievements.unlocked).toEqual({ first_game_played: 1 })
  })

  it('fills in fields an older blob lacks, keeping the ones it has', () => {
    const store = makeStore({ stats: { solo: record(4, 3), customPacksCreated: 2 }, unlocked: {} })

    expect(store.getState().achievements.stats).toEqual({ ...createDefaultStats(), solo: record(4, 3), customPacksCreated: 2 })
  })

  it("fills in a profile's bucket the same way, and drops only a bucket that isn't one", () => {
    const store = makeStore({ stats: { ...createDefaultStats(), solo: record(5, 5), profiles: { 'profile-a': { solo: record(2, 1) }, 'profile-b': { pnp: 'broken' } } }, unlocked: {} })

    const { stats } = store.getState().achievements
    expect(stats.solo).toEqual(record(5, 5))
    expect(stats.profiles).toEqual({ 'profile-a': { ...createDefaultProfileStats(), solo: record(2, 1) } })
  })

  it('falls back to fresh stats when the profiles are not a map at all', () => {
    const store = makeStore({ stats: { ...createDefaultStats(), solo: record(5, 5), profiles: ['nope'] }, unlocked: {} })

    expect(store.getState().achievements.stats).toEqual(createDefaultStats())
  })
})

describe('GameStatsProvider', () => {
  beforeEach(() => {
    mockClearAllPuzzleUnlocks.mockClear()
  })

  it("records what stored stats already clear when it mounts, the device's and each profile's, without a round", async () => {
    const stats: StatsState = { ...createDefaultStats(), solo: record(1, 1), profiles: { 'profile-a': { ...createDefaultProfileStats(), pnp: record(1, 0) } } }
    const { store } = await renderGameStats(makeStore({ stats, unlocked: {} }))

    expect(storedKeys(store)).toEqual(['first_ever_win', 'first_game_played', 'profile-a:first_game_played'])
  })

  it("returns a guest's solo round unlocks (the device's) in catalog order, and stores them with a time", async () => {
    const { store, result } = await renderGameStats()

    let unlocked: { id: string }[] = []
    await act(async () => {
      unlocked = result.current.recordSoloRound(FLAWLESS_WIN, null)
    })

    expect(ids(unlocked)).toEqual(['first_game_played', 'first_ever_win', 'flawless_debut', 'flawless_bronze', 'no_hints_needed_bronze'])
    expect(Object.keys(store.getState().achievements.unlocked)).toEqual(ids(unlocked))
    expect(Object.values(store.getState().achievements.unlocked).every((time) => typeof time === 'number')).toBe(true)
  })

  // The package's per-profile model: the device's own copies are stored too, but the profile is only
  // told about their own, never about a total someone else on the device reached.
  it("returns a profile's own unlocks, and stores the device's beside them", async () => {
    const { store, result } = await renderGameStats(makeStore({ stats: { ...createDefaultStats(), solo: record(1, 0) }, unlocked: { first_game_played: 1 } }))

    let unlocked: { id: string }[] = []
    await act(async () => {
      unlocked = result.current.recordSoloRound(FLAWLESS_WIN, 'profile-a')
    })

    expect(ids(unlocked)).toEqual(['first_game_played', 'first_ever_win', 'flawless_debut', 'flawless_bronze', 'no_hints_needed_bronze'])
    expect(storedKeys(store)).toEqual(['first_ever_win', 'first_game_played', 'flawless_bronze', 'no_hints_needed_bronze', 'profile-a:first_ever_win', 'profile-a:first_game_played', 'profile-a:flawless_bronze', 'profile-a:flawless_debut', 'profile-a:no_hints_needed_bronze'])
    // The device's first round was the earlier loss, so the device itself never got Beginner's Luck.
    expect(store.getState().achievements.unlocked).not.toHaveProperty('flawless_debut')
  })

  it('returns nothing for a round that crosses no new threshold', async () => {
    const { result } = await renderGameStats()
    await act(async () => {
      result.current.recordSoloRound({ result: 'loss', wrongGuesses: 6, guessCount: 6 }, null)
    })

    let unlocked: { id: string }[] = []
    await act(async () => {
      unlocked = result.current.recordSoloRound({ result: 'loss', wrongGuesses: 6, guessCount: 6 }, null)
    })

    expect(unlocked).toEqual([])
  })

  it("gives a guest guesser the device's Pass & Play unlocks, and a guest writer nothing on top", async () => {
    const { store, result } = await renderGameStats()

    let shown = { guesser: [] as { id: string }[], writer: [] as { id: string }[] }
    await act(async () => {
      shown = result.current.recordPnpRound({ result: 'loss', wrongGuesses: 6, guesserProfileId: null, writerProfileId: null })
    })

    expect(ids(shown.guesser)).toEqual(['first_game_played'])
    expect(shown.writer).toEqual([])
    expect(store.getState().achievements.stats).toMatchObject({ pnp: record(1, 0), solo: record(0, 0), profiles: {} })
  })

  it('shows each side of a Pass & Play round between profiles only their own unlocks', async () => {
    // The writer has played the two days before today, so writing today is a third day in a row.
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const writer = { ...createDefaultProfileStats(), distinctDaysPlayed: 2, currentDayStreak: 2, bestDayStreak: 2, lastPlayedDate: localDateString(yesterday) }
    const { result } = await renderGameStats(makeStore({ stats: { ...createDefaultStats(), profiles: { 'profile-b': writer } }, unlocked: {} }))

    let shown = { guesser: [] as { id: string }[], writer: [] as { id: string }[] }
    await act(async () => {
      shown = result.current.recordPnpRound({ result: 'win', wrongGuesses: 0, guesserProfileId: 'profile-a', writerProfileId: 'profile-b' })
    })

    expect(ids(shown.guesser)).toEqual(['first_game_played', 'first_ever_win', 'flawless_debut'])
    expect(ids(shown.writer)).toEqual(['days_played_bronze'])
  })

  it('records a new custom pack for its maker', async () => {
    const { store, result } = await renderGameStats()

    let pack: { id: string }[] = []
    await act(async () => {
      pack = result.current.recordCustomPackCreated('profile-a')
    })

    expect(ids(pack)).toEqual(['first_custom_pack'])
    expect(store.getState().achievements.stats).toMatchObject({ customPacksCreated: 1, profiles: { 'profile-a': { customPacksCreated: 1 } } })
  })

  it("resets every stat and achievement and every player's unlocked puzzles", async () => {
    const { store, result } = await renderGameStats(makeStore({ stats: { ...createDefaultStats(), solo: record(3, 3) }, unlocked: { first_ever_win: 1 } }))

    await act(async () => {
      await result.current.resetAll()
    })

    expect(store.getState().achievements).toEqual({ stats: createDefaultStats(), unlocked: {} })
    expect(mockClearAllPuzzleUnlocks).toHaveBeenCalledTimes(1)
  })

  it("removes one profile's bucket and achievements, leaving the device's and every other profile's", async () => {
    const stats: StatsState = { ...createDefaultStats(), solo: record(2, 2), profiles: { 'profile-a': { ...createDefaultProfileStats(), solo: record(1, 1) }, 'profile-ab': { ...createDefaultProfileStats(), solo: record(1, 1) } } }
    const { store, result } = await renderGameStats(makeStore({ stats, unlocked: {} }))

    await act(async () => {
      result.current.removePlayerStats('profile-a')
    })

    const { stats: after } = store.getState().achievements
    expect(Object.keys(after.profiles)).toEqual(['profile-ab'])
    expect(after.solo).toEqual(record(2, 2))
    expect(storedKeys(store)).toEqual(['first_ever_win', 'first_game_played', 'profile-ab:first_ever_win', 'profile-ab:first_game_played'])
  })

  // The always-mounted, memoized drawers take these through context: a recorded round must not
  // hand them new callbacks, or every one of them re-renders after every round.
  it('keeps the same callbacks across a recorded round', async () => {
    const { result } = await renderGameStats()
    const before = result.current

    await act(async () => {
      result.current.recordSoloRound({ result: 'win', wrongGuesses: 1, guessCount: 4, hintAvailable: false, hintRevealed: false, completedPackKeys: [] }, null)
      result.current.recordPnpRound({ result: 'win', wrongGuesses: 0, guesserProfileId: 'profile-a', writerProfileId: null })
    })

    expect(result.current).toBe(before)
  })
})
