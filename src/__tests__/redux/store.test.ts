import { profilesActions } from '@tastic/profile'
import { type PersistConfig, type PersistedState, persistReducer, REHYDRATE } from 'redux-persist'

import { activePlayerActions } from '@/redux/activePlayerSlice'
import { playerSettingsActions } from '@/redux/playerSettingsSlice'
import { playerThemeActions } from '@/redux/playerThemeSlice'
import { initialRoundState, roundActions, type RoundState } from '@/redux/roundSlice'
import { store } from '@/redux/store'
import { GUEST_PLAYER_KEY } from '@/utils/players'
import { createDefaultPnpSession } from '@/utils/pnpSession'

// The app's redux-persist mock passes the reducer straight through, so the config the store hands
// persistReducer is recorded here instead.
jest.mock('redux-persist', () => ({
  ...jest.requireActual('redux-persist'),
  persistStore: jest.fn(() => ({ purge: jest.fn(), flush: jest.fn() })),
  persistReducer: jest.fn((_config: unknown, reducer: unknown) => reducer)
}))

// Read once, as the store module loaded: persistReducer runs for the round slice (inside the root
// reducer, so first) and then for the root, so each config is found by its key, not its call order.
const configs = jest.mocked(persistReducer).mock.calls.map(([config]) => config)
const persistConfig = (key: string): PersistConfig<unknown> => {
  const config = configs.find((candidate) => candidate.key === key)
  if (!config) throw new Error(`No persistReducer config with the key ${key}`)
  return config
}
const migrateRound = (state: unknown): Promise<PersistedState> => {
  const { migrate } = persistConfig('round')
  if (!migrate) throw new Error('The round config has no migrate')
  return migrate(state as PersistedState, 3)
}

const PERSIST = { version: 3, rehydrated: true }
const validRound: RoundState = {
  solo: { [GUEST_PLAYER_KEY]: { id: 2, puzzle: { phrase: 'HELLO WORLD', modeId: 'robot', sourceMode: 'random', packKey: 'phrases' }, guessedLetters: ['H', 'Z'], hintRevealed: true } },
  pnp: { id: 5, puzzle: { phrase: 'CAT', modeId: 'classic', sourceMode: 'custom' }, guessedLetters: [], hintRevealed: false, phase: 'handoff', session: createDefaultPnpSession() },
  activeMode: 'solo'
}

beforeEach(() => {
  store.dispatch(roundActions.reset())
  store.dispatch(activePlayerActions.setActivePlayer(null))
  store.dispatch(playerSettingsActions.reset())
  store.dispatch(playerThemeActions.reset())
})

describe('store', () => {
  it('mounts the achievements slice under the key it reads and rehydrates from', () => {
    expect(store.getState()).toHaveProperty('achievements.stats')
    expect(store.getState()).toHaveProperty('achievements.unlocked')
  })

  it('mounts the round slice under the key the game screens read', () => {
    expect(store.getState().round).toEqual(initialRoundState)

    store.dispatch(roundActions.startSolo({ playerKey: GUEST_PLAYER_KEY, puzzle: { phrase: 'CAT', modeId: 'classic', sourceMode: 'random' } }))

    expect(store.getState().round.solo[GUEST_PLAYER_KEY]).toMatchObject({ id: 1, puzzle: { phrase: 'CAT' } })
  })

  it('mounts the profile roster and the per-player slices, starting with no profiles, the guest and nothing picked', () => {
    store.dispatch(profilesActions.setAll([]))
    expect(store.getState()).toMatchObject({ profiles: [], activePlayer: { profileId: null }, playerSettings: {}, playerTheme: {} })
  })

  // Without these entries the stats, achievements, the roster (the only copy on a device with no shared
  // one) and every player's picks reset on every launch, and nothing else would fail.
  it('persists the settings, the achievements slice, the profile roster and the per-player slices with the root', () => {
    expect(persistConfig('root').whitelist).toEqual(expect.arrayContaining(['theme', 'haptic', 'sound', 'achievements', 'profiles', 'activePlayer', 'playerSettings', 'playerTheme']))
  })

  // The round is saved on every guess, and rewriting the stats and achievements with it would be wasteful.
  it('keeps the round slice out of the root blob', () => {
    expect(persistConfig('root').whitelist).not.toContain('round')
  })

  // Version 2 is the per-player solo rounds (a version 1 blob's single solo round is dropped), 3 the
  // Pass & Play session (an older blob has none, so it starts a fresh one).
  it('persists the round slice under its own key, in the same storage, at version 3 with a migrate', () => {
    const round = persistConfig('round')

    expect(round.storage).toBe(persistConfig('root').storage)
    expect(round.version).toBe(3)
    expect(round.migrate).toEqual(expect.any(Function))
  })
})

// redux-persist's own reconciler would put whatever was stored straight in; each per-player slice
// sanitizes its own entry on the root's REHYDRATE instead (see rehydrate.ts).
describe('the root rehydrate', () => {
  const rehydrate = (payload: unknown, key = 'root') => store.dispatch({ type: REHYDRATE, key, payload })

  it('sanitizes each per-player slice it brings back', () => {
    rehydrate({ activePlayer: { profileId: 7 }, playerSettings: { [GUEST_PLAYER_KEY]: { modeId: 'robot', difficulty: 'impossible', packKeys: ['animals'] } }, playerTheme: { [GUEST_PLAYER_KEY]: { color: '#123456', harmony: 'sideways' } } })

    expect(store.getState()).toMatchObject({ activePlayer: { profileId: null }, playerSettings: { [GUEST_PLAYER_KEY]: { modeId: 'robot', difficulty: 'any', packKeys: ['animals'] } }, playerTheme: {} })
  })

  it('keeps only the valid profiles of a stored roster, each id once', () => {
    const alice = { id: 'profile-a', name: 'Alice', color: '#9c27b0', tag: 'A', createdAt: 1, updatedAt: 1 }
    rehydrate({ profiles: [alice, { ...alice, name: 'Second Alice' }, { ...alice, id: 'profile-b', color: 'purple' }, { ...alice, id: 'bad:id' }, 'nobody'] })

    expect(store.getState().profiles).toEqual([alice])
  })

  it('starts each per-player slice fresh when nothing was stored for it', () => {
    store.dispatch(playerSettingsActions.setDifficulty({ playerKey: GUEST_PLAYER_KEY, difficulty: 'hard' }))
    rehydrate(undefined)

    expect(store.getState().playerSettings).toEqual({})
    expect(store.getState().profiles).toEqual([])
  })

  // The round slice's blob rehydrates under its own key, which says nothing about the player slices.
  it("leaves them alone on the round slice's rehydrate", () => {
    store.dispatch(playerSettingsActions.setDifficulty({ playerKey: GUEST_PLAYER_KEY, difficulty: 'hard' }))
    rehydrate(validRound, 'round')

    expect(store.getState().playerSettings).toEqual({ [GUEST_PLAYER_KEY]: { modeId: 'classic', difficulty: 'hard', packKeys: null } })
  })
})

describe("the round slice's migrate", () => {
  it('passes a valid stored round through, keeping its _persist', async () => {
    await expect(migrateRound({ ...validRound, _persist: PERSIST })).resolves.toEqual({ ...validRound, _persist: PERSIST })
  })

  it('sanitizes a corrupt stored round slot by slot, keeping its _persist', async () => {
    const corrupt = { solo: { [GUEST_PLAYER_KEY]: { id: 'two', puzzle: null, guessedLetters: [], hintRevealed: false } }, pnp: validRound.pnp, activeMode: 'menu', _persist: PERSIST }

    await expect(migrateRound(corrupt)).resolves.toEqual({ solo: {}, pnp: validRound.pnp, activeMode: null, _persist: PERSIST })
  })

  it("drops a version 1 blob's single solo round, keeping the Pass & Play one", async () => {
    const versionOne = { ...validRound, solo: validRound.solo[GUEST_PLAYER_KEY], _persist: { version: 1, rehydrated: true } }

    await expect(migrateRound(versionOne)).resolves.toEqual({ ...validRound, solo: {}, _persist: { version: 1, rehydrated: true } })
  })

  // No migration (the app hadn't shipped): a version 2 blob's Pass & Play round has no session, so it
  // keeps its round with a fresh one.
  it("starts a fresh Pass & Play session for a version 2 blob's round", async () => {
    const { session: _session, ...versionTwoPnp } = validRound.pnp
    const versionTwo = { ...validRound, pnp: versionTwoPnp, _persist: { version: 2, rehydrated: true } }

    await expect(migrateRound(versionTwo)).resolves.toEqual({ ...validRound, _persist: { version: 2, rehydrated: true } })
  })

  it('falls back to the starting rounds for a stored blob with nothing usable in it', async () => {
    await expect(migrateRound({ solo: 'garbage', _persist: PERSIST })).resolves.toEqual({ ...initialRoundState, _persist: PERSIST })
  })

  // A first launch: nothing stored, so the slice keeps its initial state.
  it('leaves nothing stored as nothing', async () => {
    await expect(migrateRound(undefined)).resolves.toBeUndefined()
  })
})
