import { profilesActions } from '@tastic/profile'
import { type PersistConfig, type PersistedState, persistReducer, REHYDRATE } from 'redux-persist'

import { activePlayerActions } from '@/redux/activePlayerSlice'
import { playerSettingsActions } from '@/redux/playerSettingsSlice'
import { playerThemeActions } from '@/redux/playerThemeSlice'
import { pruneLeftGuestSeats } from '@/redux/rehydrate'
import { initialRoundState, roundActions, type RoundState } from '@/redux/roundSlice'
import { store } from '@/redux/store'
import { GUEST_PLAYER_KEY, guestSeatKey } from '@/utils/players'
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
  activeMode: 'solo',
  activeDoor: 'solo'
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
    expect(store.getState()).toMatchObject({ profiles: [], activePlayer: { profileId: null, seatId: null }, playerSettings: {}, playerTheme: {} })
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

  // On the web every Tastic game shares games.infinitetoken.com's localStorage, where redux-persist's
  // default prefix would make the root blob the same persist:root every game writes.
  it("stores both blobs under Hangman's own prefix, hangman:root and hangman:round", () => {
    expect(persistConfig('root').keyPrefix).toBe('hangman:')
    expect(persistConfig('round').keyPrefix).toBe('hangman:')
  })
})

// redux-persist's own reconciler would put whatever was stored straight in; each per-player slice
// sanitizes its own entry on the root's REHYDRATE instead (see rehydrate.ts).
describe('the root rehydrate', () => {
  const rehydrate = (payload: unknown, key = 'root') => store.dispatch({ type: REHYDRATE, key, payload })

  it('sanitizes each per-player slice it brings back', () => {
    rehydrate({ activePlayer: { profileId: 7 }, playerSettings: { [GUEST_PLAYER_KEY]: { modeId: 'robot', difficulty: 'impossible', packKeys: ['animals'] } }, playerTheme: { [GUEST_PLAYER_KEY]: { color: '#123456', harmony: 'sideways' } } })

    expect(store.getState()).toMatchObject({ activePlayer: { profileId: null, seatId: null }, playerSettings: { [GUEST_PLAYER_KEY]: { modeId: 'robot', difficulty: 'any', packKeys: ['animals'] } }, playerTheme: {} })
  })

  it("keeps only the valid profiles of a stored roster, each id once, never under a guest's key", () => {
    const alice = { id: 'profile-a', name: 'Alice', color: '#9c27b0', tag: 'A', createdAt: 1, updatedAt: 1 }
    rehydrate({ profiles: [alice, { ...alice, name: 'Second Alice' }, { ...alice, id: 'profile-b', color: 'purple' }, { ...alice, id: 'bad:id' }, { ...alice, id: GUEST_PLAYER_KEY }, { ...alice, id: guestSeatKey('p2') }, 'nobody'] })

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

// A guest seat's data lives as long as its seat (2026-10-18): what's kept for a seat no longer at the
// table is trimmed as the store rehydrates, whichever of the two blobs comes back last.
describe('guest seats that have left the table', () => {
  const rehydrate = (payload: unknown, key = 'root') => store.dispatch({ type: REHYDRATE, key, payload })
  const theme = { color: '#00bcd4', harmony: 'triadic' }
  const picks = { modeId: 'robot', difficulty: 'hard', packKeys: null }

  // The table: p1, p2 and p3 (the default two and one added).
  beforeEach(() => {
    store.dispatch(roundActions.addPnpPlayer())
  })

  it("drops the root blob's entries for a seat not at the table, keeping every seat's at it, Single Player's guest's and every profile's", () => {
    rehydrate({
      activePlayer: { profileId: null, seatId: 'p2' },
      playerSettings: { [GUEST_PLAYER_KEY]: picks, 'profile-a': picks, [guestSeatKey('p2')]: picks, [guestSeatKey('p9')]: picks },
      playerTheme: { [GUEST_PLAYER_KEY]: theme, [guestSeatKey('p3')]: theme, [guestSeatKey('p9')]: theme }
    })

    expect(Object.keys(store.getState().playerSettings).sort()).toEqual([GUEST_PLAYER_KEY, guestSeatKey('p2'), 'profile-a'])
    expect(Object.keys(store.getState().playerTheme).sort()).toEqual([GUEST_PLAYER_KEY, guestSeatKey('p3')])
    expect(store.getState().activePlayer).toEqual({ profileId: null, seatId: 'p2' })
  })

  it("hands a stored active player whose seat has left to Single Player's guest", () => {
    rehydrate({ activePlayer: { profileId: null, seatId: 'p9' } })

    expect(store.getState().activePlayer).toEqual({ profileId: null, seatId: null })
  })

  // The root blob came back first, with the stored table not in yet.
  it("trims them again on the round's rehydrate, against the table that came back", () => {
    store.dispatch(playerSettingsActions.setDifficulty({ playerKey: guestSeatKey('p3'), difficulty: 'hard' }))
    store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: guestSeatKey('p3'), theme: { color: '#00bcd4', harmony: 'triadic' } }))
    store.dispatch(activePlayerActions.setActivePlayer(null, 'p3'))
    store.dispatch(roundActions.removePnpPlayer('p3'))

    rehydrate(validRound, 'round')

    expect(store.getState().playerSettings).toEqual({})
    expect(store.getState().playerTheme).toEqual({})
    expect(store.getState().activePlayer).toEqual({ profileId: null, seatId: null })
  })

  it('waits for the round to come back before trimming anything, and hands back the same state with nothing to trim', () => {
    const state = store.getState()
    const stale = { ...state, playerSettings: { [guestSeatKey('p9')]: state.playerSettings[GUEST_PLAYER_KEY] } }

    expect(pruneLeftGuestSeats({ ...stale, round: { ...state.round, _persist: { version: 3, rehydrated: false } } }).playerSettings).toBe(stale.playerSettings)
    expect(pruneLeftGuestSeats({ ...stale, round: { ...state.round, _persist: { version: 3, rehydrated: true } } }).playerSettings).toEqual({})
    expect(pruneLeftGuestSeats(state)).toBe(state)
  })
})

describe("the round slice's migrate", () => {
  it('passes a valid stored round through, keeping its _persist', async () => {
    await expect(migrateRound({ ...validRound, _persist: PERSIST })).resolves.toEqual({ ...validRound, _persist: PERSIST })
  })

  it('sanitizes a corrupt stored round slot by slot, keeping its _persist', async () => {
    const corrupt = { solo: { [GUEST_PLAYER_KEY]: { id: 'two', puzzle: null, guessedLetters: [], hintRevealed: false } }, pnp: validRound.pnp, activeMode: 'menu', _persist: PERSIST }

    await expect(migrateRound(corrupt)).resolves.toEqual({ solo: {}, pnp: validRound.pnp, activeMode: null, activeDoor: null, _persist: PERSIST })
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

  // A guest seat's waiting round goes with its seat.
  it("drops a guest seat's solo round whose seat isn't at the stored table", async () => {
    const round = { ...validRound.solo[GUEST_PLAYER_KEY] }
    const stored = { ...validRound, solo: { ...validRound.solo, [guestSeatKey('p2')]: round, [guestSeatKey('p9')]: round }, _persist: PERSIST }

    await expect(migrateRound(stored)).resolves.toEqual({ ...validRound, solo: { ...validRound.solo, [guestSeatKey('p2')]: round }, _persist: PERSIST })
  })

  // A first launch: nothing stored, so the slice keeps its initial state.
  it('leaves nothing stored as nothing', async () => {
    await expect(migrateRound(undefined)).resolves.toBeUndefined()
  })
})
