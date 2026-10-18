import { defaultColors } from '@rific/auto-paper'
import type { Profile } from '@tastic/profile'

import { DEFAULT_HARMONY, type PlayerThemeState } from '@/redux/playerThemeSlice'
import { initialRoundState, type RoundState } from '@/redux/roundSlice'
import { pickGuestSeatColors } from '@/utils/guestSeats'
import { GUEST_PLAYER_KEY, guestSeatKey } from '@/utils/players'
import { createDefaultPnpSession, type PnpPlayer } from '@/utils/pnpSession'

const swatch = (label: string) => defaultColors.find((color) => color.label === label)!.value
const RED = swatch('Red')
const CORAL = swatch('Coral')
const ORANGE = swatch('Orange')
const AMBER = swatch('Amber')
const LIME = swatch('Lime')
const CYAN = swatch('Cyan')
const BLUE = swatch('Blue')
const MAGENTA = swatch('Magenta')

const ALICE: Profile = { id: 'profile-a', name: 'Alice', color: RED, tag: 'AL', createdAt: 1, updatedAt: 1 }

// A table of these seats, in order (a profile's seat by its profile).
const tableOf = (players: PnpPlayer[]): Pick<RoundState, 'pnp'> => ({ pnp: { ...initialRoundState.pnp, session: { ...createDefaultPnpSession(), players } } })
const guest = (id: string): PnpPlayer => ({ id, name: 'Player', profileId: null })
const profileSeat = (id: string, profile: Profile): PnpPlayer => ({ id, name: profile.name, profileId: profile.id })

const pick = (players: PnpPlayer[], { profiles = [] as Profile[], playerTheme = {} as PlayerThemeState } = {}) => pickGuestSeatColors({ round: tableOf(players), profiles, playerTheme })

describe('pickGuestSeatColors', () => {
  // Spread across the wheel, not taken in order: Coral beside Red read as one color on a chip.
  it('starts a table of guests on the first swatch, then each across the wheel from the rest, in the default harmony', () => {
    expect(pick([guest('p1'), guest('p2'), guest('p3')])).toEqual([
      { playerKey: guestSeatKey('p1'), theme: { color: RED, harmony: DEFAULT_HARMONY } },
      { playerKey: guestSeatKey('p2'), theme: { color: CYAN, harmony: DEFAULT_HARMONY } },
      { playerKey: guestSeatKey('p3'), theme: { color: LIME, harmony: DEFAULT_HARMONY } }
    ])
  })

  it('gives a full table of eight guests eight different colors', () => {
    const colors = pick(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map(guest)).map((picked) => picked.theme.color)

    expect(new Set(colors).size).toBe(8)
  })

  it('skips the colors a seated profile and another guest seat are showing', () => {
    const playerTheme: PlayerThemeState = { [guestSeatKey('p2')]: { color: CORAL.toUpperCase(), harmony: 'triadic' } }

    expect(pick([profileSeat('p1', ALICE), guest('p2'), guest('p3')], { profiles: [ALICE], playerTheme })).toEqual([{ playerKey: guestSeatKey('p3'), theme: { color: CYAN, harmony: DEFAULT_HARMONY } }])
  })

  // A profile shows their Hangman pick while their profile keeps the color it was picked against.
  it("skips a profile's Hangman pick rather than their profile's color", () => {
    const playerTheme: PlayerThemeState = { [ALICE.id]: { color: ORANGE, harmony: 'triadic', profileColor: ALICE.color } }

    expect(pick([profileSeat('p1', ALICE), guest('p2')], { profiles: [ALICE], playerTheme })).toEqual([{ playerKey: guestSeatKey('p2'), theme: { color: BLUE, harmony: DEFAULT_HARMONY } }])
  })

  // Single Player's guest isn't at the table, and a profile's seat keeps its own guest's colors for
  // when the seat is handed back, but they aren't showing.
  it("ignores Single Player's guest and the guest of a seat a profile sits in", () => {
    const playerTheme: PlayerThemeState = { [GUEST_PLAYER_KEY]: { color: RED, harmony: 'triadic' }, [guestSeatKey('p1')]: { color: CORAL, harmony: 'triadic' } }

    expect(pick([profileSeat('p1', { ...ALICE, color: AMBER }), guest('p2'), guest('p3')], { profiles: [{ ...ALICE, color: AMBER }], playerTheme })).toEqual([
      { playerKey: guestSeatKey('p2'), theme: { color: BLUE, harmony: DEFAULT_HARMONY } },
      { playerKey: guestSeatKey('p3'), theme: { color: MAGENTA, harmony: DEFAULT_HARMONY } }
    ])
  })

  // A seat whose profile has just left the roster plays as its own guest.
  it("colors a seat whose profile isn't on the roster as its own guest's", () => {
    expect(pick([profileSeat('p1', ALICE), guest('p2')])).toEqual([
      { playerKey: guestSeatKey('p1'), theme: { color: RED, harmony: DEFAULT_HARMONY } },
      { playerKey: guestSeatKey('p2'), theme: { color: CYAN, harmony: DEFAULT_HARMONY } }
    ])
  })

  it('picks nothing when every seat already has colors', () => {
    const playerTheme: PlayerThemeState = { [guestSeatKey('p1')]: { color: RED, harmony: 'triadic' }, [guestSeatKey('p2')]: { color: { primary: RED, secondary: CORAL, tertiary: ORANGE }, harmony: 'triadic' } }

    expect(pick([guest('p1'), guest('p2')], { playerTheme })).toEqual([])
  })
})
