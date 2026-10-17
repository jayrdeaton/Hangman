import { GUEST_PLAYER_KEY, isPlayerKey, playerKeyFor } from '@/utils/players'

describe('players', () => {
  it("files the guest under the guest's key and a profile under its own id", () => {
    expect(playerKeyFor(null)).toBe(GUEST_PLAYER_KEY)
    expect(playerKeyFor('profile-123-abc')).toBe('profile-123-abc')
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
})
