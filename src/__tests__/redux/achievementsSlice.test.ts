import { REHYDRATE } from 'redux-persist'

import achievementsReducer from '@/redux/achievementsSlice'
import { createDefaultStats } from '@/utils/statsValidation'

const rehydrate = (key: string, achievements: unknown) => ({ type: REHYDRATE, key, payload: { achievements } })
const initial = () => achievementsReducer(undefined, { type: 'test/init' })

// A device bucket as stats were saved before they went per player: no `profiles`.
const prePlayerStats = () => {
  const { profiles: _profiles, ...device } = createDefaultStats()
  return { ...device, solo: { played: 40, wins: 30, losses: 10, draws: 0 } }
}

describe('achievementsSlice', () => {
  // No migrations: the app hasn't shipped, and the puzzle unlocks, rounds and settings saved alongside
  // it started over at the same change.
  it('starts a blob saved before stats went per player fresh, its earned achievements too', () => {
    const state = achievementsReducer(initial(), rehydrate('root', { stats: prePlayerStats(), unlocked: { collection_complete: 1700000000000 } }))

    expect(state.stats.solo.played).toBe(0)
    expect(state.stats.profiles).toEqual({})
    expect(state.unlocked).toEqual({})
  })

  it('keeps a per-player blob as it was saved', () => {
    const stats = { ...createDefaultStats(), solo: { played: 3, wins: 2, losses: 1, draws: 0 } }
    const state = achievementsReducer(initial(), rehydrate('root', { stats, unlocked: { first_game_played: 1700000000000 } }))

    expect(state.stats.solo.played).toBe(3)
    expect(state.unlocked).toEqual({ first_game_played: 1700000000000 })
  })

  // The round slice rehydrates under its own key, with its own blob (no achievements in it).
  it("keeps the stats through the round's own rehydrate", () => {
    const stats = { ...createDefaultStats(), solo: { played: 3, wins: 2, losses: 1, draws: 0 } }
    const before = achievementsReducer(initial(), rehydrate('root', { stats, unlocked: { first_game_played: 1700000000000 } }))

    const after = achievementsReducer(before, { type: REHYDRATE, key: 'round', payload: { solo: {}, pnp: {}, activeMode: null } })

    expect(after.stats.solo.played).toBe(3)
    expect(after.unlocked).toEqual({ first_game_played: 1700000000000 })
  })
})
