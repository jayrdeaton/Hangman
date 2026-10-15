import { persistReducer } from 'redux-persist'

import { store } from '@/redux/store'

// The app's redux-persist mock passes the reducer straight through, so the config the store hands
// persistReducer is recorded here instead.
jest.mock('redux-persist', () => ({
  ...jest.requireActual('redux-persist'),
  persistStore: jest.fn(() => ({ purge: jest.fn(), flush: jest.fn() })),
  persistReducer: jest.fn((_config: unknown, reducer: unknown) => reducer)
}))

describe('store', () => {
  it('mounts the achievements slice under the key it reads and rehydrates from', () => {
    expect(store.getState()).toHaveProperty('achievements.stats')
    expect(store.getState()).toHaveProperty('achievements.unlocked')
  })

  // Without this entry the stats and achievements reset on every launch, and nothing else would fail.
  it('persists the achievements slice with the settings', () => {
    const [config] = jest.mocked(persistReducer).mock.calls[0]
    expect(config.whitelist).toEqual(expect.arrayContaining(['theme', 'haptic', 'sound', 'achievements']))
  })
})
