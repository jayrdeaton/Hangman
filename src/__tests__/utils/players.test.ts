import { GUEST_PLAYER_KEY, guestSeatKey, guestSeatRef, isGuestSeatKey, isPlayerKey, isProfileId, playerKeyFor, SINGLE_PLAYER_SEAT_ID } from '@/utils/players'

describe('players', () => {
  it("files Single Player's guest under the guest's key and a profile under its own id", () => {
    expect(playerKeyFor(null)).toBe(GUEST_PLAYER_KEY)
    expect(playerKeyFor('profile-123-abc')).toBe('profile-123-abc')
  })

  // Each Pass & Play guest seat is a player of its own (2026-10-18), by the seat's stable id.
  it("files a guest seat's guest under the seat's own key, never Single Player's guest's", () => {
    expect(playerKeyFor(null, 'p2')).toBe('guest-p2')
    expect(guestSeatKey('p2')).toBe('guest-p2')
    expect(playerKeyFor(null, 'p2')).not.toBe(playerKeyFor(null, 'p3'))
    expect(playerKeyFor(null, 'p2')).not.toBe(GUEST_PLAYER_KEY)
    expect(isPlayerKey(guestSeatKey('p2'))).toBe(true)
  })

  // Seat 1's guest is Single Player's (2026-10-19): one player at either door.
  it("files seat 1's guest as Single Player's guest, and refers to them by no seat", () => {
    expect(SINGLE_PLAYER_SEAT_ID).toBe('p1')
    expect(guestSeatKey('p1')).toBe(GUEST_PLAYER_KEY)
    expect(playerKeyFor(null, 'p1')).toBe(GUEST_PLAYER_KEY)
    expect(isGuestSeatKey(guestSeatKey('p1'))).toBe(false)
    expect([guestSeatRef('p1'), guestSeatRef('p2'), guestSeatRef(null)]).toEqual([null, 'p2', null])
  })

  // A profile is the same player in any seat.
  it('files a profile under its own id whatever seat it sits in', () => {
    expect(playerKeyFor('profile-123-abc', 'p2')).toBe('profile-123-abc')
  })

  it("tells a guest seat's key apart from every other key", () => {
    expect(isGuestSeatKey(guestSeatKey('p7'))).toBe(true)
    expect(isGuestSeatKey(GUEST_PLAYER_KEY)).toBe(false)
    expect(isGuestSeatKey('profile-123-abc')).toBe(false)
  })

  // The per-player storage keys put a ':' between the prefix and the player, so a key can't hold one.
  it.each([
    ['the guest', true, GUEST_PLAYER_KEY],
    ['a profile id', true, 'profile-123-abc'],
    ['an empty string', false, ''],
    ['a key with a colon', false, 'profile:abc'],
    ['a number', false, 7],
    ['null', false, null]
  ])('takes %s as a player key: %s', (_label, expected, value) => {
    expect(isPlayerKey(value)).toBe(expected)
  })

  // So no guest's key can ever name a profile.
  it.each([
    ['a profile id', true, 'profile-123-abc'],
    ["Single Player's guest's key", false, GUEST_PLAYER_KEY],
    ["a guest seat's key", false, guestSeatKey('p2')],
    ['a key with a colon', false, 'profile:abc'],
    ['null', false, null]
  ])('takes %s as a profile id: %s', (_label, expected, value) => {
    expect(isProfileId(value)).toBe(expected)
  })
})
