import { type PersistConfig, type PersistedState, persistReducer } from 'redux-persist'

import { initialRoundState, roundActions, type RoundState } from '@/redux/roundSlice'
import { store } from '@/redux/store'

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
  return migrate(state as PersistedState, 1)
}

const PERSIST = { version: 1, rehydrated: true }
const validRound: RoundState = {
  solo: { id: 2, puzzle: { phrase: 'HELLO WORLD', modeId: 'robot', sourceMode: 'random', packKey: 'phrases' }, guessedLetters: ['H', 'Z'], hintRevealed: true },
  pnp: { id: 5, puzzle: { phrase: 'CAT', modeId: 'classic', sourceMode: 'custom' }, guessedLetters: [], hintRevealed: false, phase: 'handoff' },
  activeMode: 'solo'
}

beforeEach(() => {
  store.dispatch(roundActions.reset())
})

describe('store', () => {
  it('mounts the achievements slice under the key it reads and rehydrates from', () => {
    expect(store.getState()).toHaveProperty('achievements.stats')
    expect(store.getState()).toHaveProperty('achievements.unlocked')
  })

  it('mounts the round slice under the key the game screens read', () => {
    expect(store.getState().round).toEqual(initialRoundState)

    store.dispatch(roundActions.startSolo({ phrase: 'CAT', modeId: 'classic', sourceMode: 'random' }))

    expect(store.getState().round.solo).toMatchObject({ id: 1, puzzle: { phrase: 'CAT' } })
  })

  // Without this entry the stats and achievements reset on every launch, and nothing else would fail.
  it('persists the settings and the achievements slice with the root', () => {
    expect(persistConfig('root').whitelist).toEqual(expect.arrayContaining(['theme', 'haptic', 'sound', 'achievements']))
  })

  // The round is saved on every guess, and rewriting the stats and achievements with it would be wasteful.
  it('keeps the round slice out of the root blob', () => {
    expect(persistConfig('root').whitelist).not.toContain('round')
  })

  it('persists the round slice under its own key, in the same storage, with a migrate', () => {
    const round = persistConfig('round')

    expect(round.storage).toBe(persistConfig('root').storage)
    expect(round.migrate).toEqual(expect.any(Function))
  })
})

describe("the round slice's migrate", () => {
  it('passes a valid stored round through, keeping its _persist', async () => {
    await expect(migrateRound({ ...validRound, _persist: PERSIST })).resolves.toEqual({ ...validRound, _persist: PERSIST })
  })

  it('sanitizes a corrupt stored round slot by slot, keeping its _persist', async () => {
    const corrupt = { solo: { id: 'two', puzzle: null, guessedLetters: [], hintRevealed: false }, pnp: validRound.pnp, activeMode: 'menu', _persist: PERSIST }

    await expect(migrateRound(corrupt)).resolves.toEqual({ solo: initialRoundState.solo, pnp: validRound.pnp, activeMode: null, _persist: PERSIST })
  })

  it('falls back to the starting rounds for a stored blob with nothing usable in it', async () => {
    await expect(migrateRound({ solo: 'garbage', _persist: PERSIST })).resolves.toEqual({ ...initialRoundState, _persist: PERSIST })
  })

  // A first launch: nothing stored, so the slice keeps its initial state.
  it('leaves nothing stored as nothing', async () => {
    await expect(migrateRound(undefined)).resolves.toBeUndefined()
  })
})
