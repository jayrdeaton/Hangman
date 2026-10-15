import { configureStore } from '@reduxjs/toolkit'
import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { Provider as ReduxProvider } from 'react-redux'

import { GameStatsProvider, useGameStats, useUnlockedAchievementCount } from '@/hooks/useGameStats'
import achievements from '@/redux/achievementsSlice'
import { createDefaultStats } from '@/utils/statsValidation'
import { clearPuzzleUnlocks } from '@/utils/unlocks'

jest.mock('@/utils/unlocks', () => ({
  ...jest.requireActual('@/utils/unlocks'),
  clearPuzzleUnlocks: jest.fn().mockResolvedValue(undefined)
}))

const mockClearPuzzleUnlocks = jest.mocked(clearPuzzleUnlocks)

const REHYDRATE = 'persist/REHYDRATE'
const record = (played: number, wins: number) => ({ played, wins, losses: played - wins, draws: 0 })

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
  return renderHook(() => ({ actions: useGameStats(), earned: useUnlockedAchievementCount() }), { wrapper }).then((utils) => ({ ...utils, store }))
}

const ids = (list: { id: string }[]) => list.map((achievement) => achievement.id)

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
})

describe('GameStatsProvider', () => {
  beforeEach(() => {
    mockClearPuzzleUnlocks.mockClear()
  })

  it('records what stored stats already clear when it mounts, without a round', async () => {
    const { store, result } = await renderGameStats(makeStore({ stats: { ...createDefaultStats(), solo: record(1, 1) }, unlocked: {} }))

    expect(Object.keys(store.getState().achievements.unlocked).sort()).toEqual(['first_ever_win', 'first_game_played'])
    expect(result.current.earned).toBe(2)
  })

  it("returns a solo round's unlocks in catalog order, and stores them with a time", async () => {
    const { store, result } = await renderGameStats()

    let unlocked: { id: string }[] = []
    await act(async () => {
      unlocked = result.current.actions.recordSoloRound({ result: 'win', modeId: 'classic', wrongGuesses: 0, guessCount: 3, hintAvailable: true, hintRevealed: false, completedPackKeys: [] })
    })

    expect(ids(unlocked)).toEqual(['first_game_played', 'first_ever_win', 'flawless_debut', 'flawless_bronze', 'no_hints_needed_bronze'])
    expect(Object.keys(store.getState().achievements.unlocked)).toEqual(ids(unlocked))
    expect(Object.values(store.getState().achievements.unlocked).every((time) => typeof time === 'number')).toBe(true)
    expect(result.current.earned).toBe(5)
  })

  it('returns nothing for a round that crosses no new threshold', async () => {
    const { result } = await renderGameStats()
    await act(async () => {
      result.current.actions.recordSoloRound({ result: 'loss', wrongGuesses: 6, guessCount: 6 })
    })

    let unlocked: { id: string }[] = []
    await act(async () => {
      unlocked = result.current.actions.recordSoloRound({ result: 'loss', wrongGuesses: 6, guessCount: 6 })
    })

    expect(unlocked).toEqual([])
  })

  it('records Pass & Play rounds and new custom packs on their own counts', async () => {
    const { store, result } = await renderGameStats()

    let pnp: { id: string }[] = []
    let pack: { id: string }[] = []
    await act(async () => {
      pnp = result.current.actions.recordPnpRound('loss', 6)
      pack = result.current.actions.recordCustomPackCreated()
    })

    expect(ids(pnp)).toEqual(['first_game_played'])
    expect(ids(pack)).toEqual(['first_custom_pack'])
    expect(store.getState().achievements.stats).toMatchObject({ pnp: record(1, 0), solo: record(0, 0), customPacksCreated: 1 })
  })

  it('resets every stat and achievement and every unlocked puzzle', async () => {
    const { store, result } = await renderGameStats(makeStore({ stats: { ...createDefaultStats(), solo: record(3, 3) }, unlocked: { first_ever_win: 1 } }))

    await act(async () => {
      await result.current.actions.resetAll()
    })

    expect(store.getState().achievements).toEqual({ stats: createDefaultStats(), unlocked: {} })
    expect(mockClearPuzzleUnlocks).toHaveBeenCalledTimes(1)
  })

  // The always-mounted, memoized drawers take these through context: a recorded round must not
  // hand them new callbacks, or every one of them re-renders after every round.
  it('keeps the same callbacks across a recorded round', async () => {
    const { result } = await renderGameStats()
    const before = result.current.actions

    await act(async () => {
      result.current.actions.recordSoloRound({ result: 'win', wrongGuesses: 1, guessCount: 4, hintAvailable: false, hintRevealed: false, completedPackKeys: [] })
    })

    expect(result.current.actions).toBe(before)
  })

  it('counts only unlocks that are still in the catalog', async () => {
    const { result } = await renderGameStats(makeStore({ stats: createDefaultStats(), unlocked: { first_game_played: 1, retired_achievement: 2 } }))

    expect(result.current.earned).toBe(1)
  })
})
