import { REHYDRATE } from 'redux-persist'

import reducer, { activePlayerActions, initialActivePlayerState, sanitizeActivePlayer } from '@/redux/activePlayerSlice'
import { GUEST_PLAYER_KEY } from '@/utils/players'

const rehydrate = (payload: unknown, key = 'root') => reducer(initialActivePlayerState, { type: REHYDRATE, key, payload })

describe('activePlayerSlice', () => {
  it('starts with the guest', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({ profileId: null })
  })

  it('switches to a profile and back to the guest', () => {
    const profile = reducer(initialActivePlayerState, activePlayerActions.setActivePlayer('profile-a'))

    expect(profile).toEqual({ profileId: 'profile-a' })
    expect(reducer(profile, activePlayerActions.setActivePlayer(null))).toEqual({ profileId: null })
  })

  it('brings a stored profile back on the root rehydrate', () => {
    expect(rehydrate({ activePlayer: { profileId: 'profile-a' } })).toEqual({ profileId: 'profile-a' })
  })

  it("ignores the round slice's rehydrate", () => {
    const state = reducer(initialActivePlayerState, activePlayerActions.setActivePlayer('profile-a'))

    expect(reducer(state, { type: REHYDRATE, key: 'round', payload: {} })).toBe(state)
  })

  it.each([
    ['nothing stored', undefined],
    ['a slice that is not an object', 'profile-a'],
    ['an id that is not a string', { profileId: 7 }],
    ['an empty id', { profileId: '' }],
    ["the guest's own key", { profileId: GUEST_PLAYER_KEY }]
  ])('falls back to the guest for %s', (_label, value) => {
    expect(sanitizeActivePlayer(value)).toEqual({ profileId: null })
    expect(rehydrate({ activePlayer: value })).toEqual({ profileId: null })
  })
})
