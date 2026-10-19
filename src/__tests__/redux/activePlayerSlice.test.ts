import { REHYDRATE } from 'redux-persist'

import reducer, { activePlayerActions, initialActivePlayerState, sanitizeActivePlayer } from '@/redux/activePlayerSlice'
import { GUEST_PLAYER_KEY, guestSeatKey } from '@/utils/players'

const rehydrate = (payload: unknown, key = 'root') => reducer(initialActivePlayerState, { type: REHYDRATE, key, payload })

const GUEST = { profileId: null, seatId: null }

describe('activePlayerSlice', () => {
  it("starts with Single Player's guest", () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual(GUEST)
  })

  it('switches to a profile and back to the guest', () => {
    const profile = reducer(initialActivePlayerState, activePlayerActions.setActivePlayer('profile-a'))

    expect(profile).toEqual({ profileId: 'profile-a', seatId: null })
    expect(reducer(profile, activePlayerActions.setActivePlayer(null))).toEqual(GUEST)
  })

  it("switches to a Pass & Play guest seat's own guest, and back to Single Player's", () => {
    const seat = reducer(initialActivePlayerState, activePlayerActions.setActivePlayer(null, 'p2'))

    expect(seat).toEqual({ profileId: null, seatId: 'p2' })
    expect(reducer(seat, activePlayerActions.setActivePlayer(null))).toEqual(GUEST)
  })

  // Seat 1's guest is Single Player's (2026-10-19).
  it("takes seat 1's guest as Single Player's, stored or picked", () => {
    expect(reducer(initialActivePlayerState, activePlayerActions.setActivePlayer(null, 'p1'))).toEqual(GUEST)
    expect(rehydrate({ activePlayer: { profileId: null, seatId: 'p1' } })).toEqual(GUEST)
  })

  // A profile is the same player in any seat.
  it('never keeps a seat for a profile', () => {
    expect(reducer(initialActivePlayerState, activePlayerActions.setActivePlayer('profile-a', 'p2'))).toEqual({ profileId: 'profile-a', seatId: null })
  })

  it('brings a stored profile, or a stored guest seat, back on the root rehydrate', () => {
    expect(rehydrate({ activePlayer: { profileId: 'profile-a' } })).toEqual({ profileId: 'profile-a', seatId: null })
    expect(rehydrate({ activePlayer: { profileId: null, seatId: 'p3' } })).toEqual({ profileId: null, seatId: 'p3' })
    expect(rehydrate({ activePlayer: { profileId: 'profile-a', seatId: 'p3' } })).toEqual({ profileId: 'profile-a', seatId: null })
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
    ["the guest's own key", { profileId: GUEST_PLAYER_KEY }],
    ["a guest seat's key as a profile", { profileId: guestSeatKey('p2') }],
    ['a seat id that is not one', { profileId: null, seatId: 'p:2' }],
    ['a seat id that is not a string', { profileId: null, seatId: 2 }]
  ])("falls back to Single Player's guest for %s", (_label, value) => {
    expect(sanitizeActivePlayer(value)).toEqual(GUEST)
    expect(rehydrate({ activePlayer: value })).toEqual(GUEST)
  })
})
