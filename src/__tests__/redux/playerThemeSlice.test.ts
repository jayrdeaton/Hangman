import { defaultThemeSettings } from '@rific/auto-paper'
import { REHYDRATE } from 'redux-persist'

import reducer, { DEFAULT_HARMONY, isSamePlayerTheme, isSamePlayerThemeEntry, type PlayerTheme, playerThemeActions, resolvePlayerTheme, sanitizePlayerTheme } from '@/redux/playerThemeSlice'
import { GUEST_PLAYER_KEY } from '@/utils/players'

const OTHER = 'profile-a'
const RED: PlayerTheme = { color: '#f44336', harmony: 'split-complementary' }
const TRIAD: PlayerTheme = { color: { primary: '#111111', secondary: '#222222', tertiary: '#333333' }, harmony: 'triadic' }

describe('playerThemeSlice', () => {
  it('starts with nobody having colors of their own', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({})
  })

  it("files each player's colors under them, and removes or resets them", () => {
    let state = reducer({}, playerThemeActions.setPlayerTheme({ playerKey: GUEST_PLAYER_KEY, theme: RED }))
    state = reducer(state, playerThemeActions.setPlayerTheme({ playerKey: OTHER, theme: TRIAD }))

    expect(state).toEqual({ [GUEST_PLAYER_KEY]: RED, [OTHER]: TRIAD })
    expect(reducer(state, playerThemeActions.removePlayer(OTHER))).toEqual({ [GUEST_PLAYER_KEY]: RED })
    expect(reducer(state, playerThemeActions.reset())).toEqual({})
  })
})

describe('isSamePlayerTheme', () => {
  it('compares a seed color and its harmony', () => {
    expect(isSamePlayerTheme(RED, { ...RED })).toBe(true)
    expect(isSamePlayerTheme(RED, { ...RED, color: '#000000' })).toBe(false)
    expect(isSamePlayerTheme(RED, { ...RED, harmony: 'triadic' })).toBe(false)
  })

  // A triad that went through storage is never the same object as the one on screen.
  it('compares an explicit triad by its colors', () => {
    expect(isSamePlayerTheme(TRIAD, { ...TRIAD, color: { primary: '#111111', secondary: '#222222', tertiary: '#333333' } })).toBe(true)
    expect(isSamePlayerTheme(TRIAD, { ...TRIAD, color: { primary: '#111111', secondary: '#222222', tertiary: '#444444' } })).toBe(false)
    expect(isSamePlayerTheme(TRIAD, { ...TRIAD, color: '#111111' })).toBe(false)
  })

  it('takes a missing entry as different from any colors', () => {
    expect(isSamePlayerTheme(undefined, RED)).toBe(false)
    expect(isSamePlayerTheme(undefined, undefined)).toBe(true)
  })
})

describe('sanitizePlayerTheme', () => {
  it('passes valid entries through', () => {
    const state = { [GUEST_PLAYER_KEY]: RED, [OTHER]: TRIAD }

    expect(sanitizePlayerTheme(state)).toEqual(state)
  })

  it.each([
    ['an empty color', { color: '', harmony: 'triadic' }],
    ['a color that is not one', { color: 7, harmony: 'triadic' }],
    ['a triad missing a color', { color: { primary: '#111111', secondary: '#222222' }, harmony: 'triadic' }],
    ['an unknown harmony', { color: '#f44336', harmony: 'sideways' }],
    ['no harmony', { color: '#f44336' }],
    ['an entry that is not an object', '#f44336']
  ])('drops an entry with %s, keeping the rest', (_label, entry) => {
    expect(sanitizePlayerTheme({ [GUEST_PLAYER_KEY]: entry, [OTHER]: RED })).toEqual({ [OTHER]: RED })
  })

  it('drops an entry under a key no player could have, and starts fresh for anything but a map', () => {
    expect(sanitizePlayerTheme({ 'profile:a': RED, '': RED })).toEqual({})
    expect(sanitizePlayerTheme(['nope'])).toEqual({})
    expect(sanitizePlayerTheme(undefined)).toEqual({})
  })

  it('keeps only the three colors of a stored triad', () => {
    expect(sanitizePlayerTheme({ [OTHER]: { color: { ...(TRIAD.color as object), extra: '#999999' }, harmony: 'triadic' } })).toEqual({ [OTHER]: TRIAD })
  })

  it('runs on the root rehydrate, and not on the round one', () => {
    expect(reducer({}, { type: REHYDRATE, key: 'root', payload: { playerTheme: { [GUEST_PLAYER_KEY]: { color: '#f44336', harmony: 'sideways' }, [OTHER]: RED } } })).toEqual({ [OTHER]: RED })
    const before = { [GUEST_PLAYER_KEY]: RED }
    expect(reducer(before, { type: REHYDRATE, key: 'round', payload: {} })).toBe(before)
  })
})

describe('DEFAULT_HARMONY', () => {
  it("is auto-paper's own default, the harmony the app starts on", () => {
    expect(DEFAULT_HARMONY).toBe(defaultThemeSettings.harmony)
  })
})

// A profile's pick is kept with the profile's own color at the time (playerThemeSlice's
// resolvePlayerTheme): it holds while the profile keeps that color, and lapses once it changes.
describe('resolvePlayerTheme', () => {
  const PURPLE = '#9c27b0'
  const PICK = { color: '#2196f3', harmony: 'triadic' as const, profileColor: PURPLE }

  it('gives the guest their entry, or nothing, which leaves the colors on screen', () => {
    expect(resolvePlayerTheme(RED, null)).toEqual(RED)
    expect(resolvePlayerTheme(undefined, null)).toBeNull()
  })

  it('gives a profile their pick while the profile has the color it was picked against, in any case', () => {
    expect(resolvePlayerTheme(PICK, PURPLE)).toEqual({ color: '#2196f3', harmony: 'triadic' })
    expect(resolvePlayerTheme(PICK, PURPLE.toUpperCase())).toEqual({ color: '#2196f3', harmony: 'triadic' })
  })

  it('gives a profile its own color once that changes, keeping the harmony they picked', () => {
    expect(resolvePlayerTheme(PICK, '#ff9800')).toEqual({ color: '#ff9800', harmony: 'triadic' })
  })

  it('gives a profile with nothing kept its own color and the default harmony', () => {
    expect(resolvePlayerTheme(undefined, PURPLE)).toEqual({ color: PURPLE, harmony: DEFAULT_HARMONY })
  })

  it('treats a guest entry under a profile (no profile color kept) as lapsed', () => {
    expect(resolvePlayerTheme(RED, PURPLE)).toEqual({ color: PURPLE, harmony: RED.harmony })
  })
})

describe('isSamePlayerThemeEntry', () => {
  it('also compares the profile color a pick was made against, in any case', () => {
    expect(isSamePlayerThemeEntry({ ...RED, profileColor: '#9c27b0' }, { ...RED, profileColor: '#9C27B0' })).toBe(true)
    expect(isSamePlayerThemeEntry({ ...RED, profileColor: '#9c27b0' }, { ...RED, profileColor: '#ff9800' })).toBe(false)
    expect(isSamePlayerThemeEntry({ ...RED, profileColor: '#9c27b0' }, RED)).toBe(false)
    expect(isSamePlayerThemeEntry(undefined, RED)).toBe(false)
  })
})

describe("sanitizePlayerTheme's profile color", () => {
  it('keeps a stored profile color, and drops one that is not a string so that pick lapses', () => {
    expect(sanitizePlayerTheme({ [OTHER]: { ...RED, profileColor: '#9c27b0' } })).toEqual({ [OTHER]: { ...RED, profileColor: '#9c27b0' } })
    expect(sanitizePlayerTheme({ [OTHER]: { ...RED, profileColor: 7 } })).toEqual({ [OTHER]: RED })
    expect(sanitizePlayerTheme({ [OTHER]: { ...RED, profileColor: '' } })).toEqual({ [OTHER]: RED })
  })
})
