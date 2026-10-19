import { themeActions } from '@rific/auto-paper'
import { type Profile, profilesActions } from '@tastic/profile'

import { playerThemeActions } from '@/redux/playerThemeSlice'
import { roundActions, type SavedPuzzle } from '@/redux/roundSlice'
import { store } from '@/redux/store'
import { arePlayerColorsShown, getPackTurnPlan, getSeatPlayer, getSeatPlayerKey, getTurnPlayer, getTurnPlayerKey, isPackTurnUnderWay } from '@/utils/packTurns'
import { GUEST_PLAYER_KEY, guestSeatKey } from '@/utils/players'

const ALICE: Profile = { id: 'profile-a', name: 'Alice', color: '#9c27b0', tag: 'AL', createdAt: 1, updatedAt: 1 }
const BOB: Profile = { id: 'profile-b', name: 'Bob', color: '#4caf50', tag: 'BO', createdAt: 2, updatedAt: 2 }
const CAT: SavedPuzzle = { phrase: 'CAT', modeId: 'classic', sourceMode: 'random', difficultyTier: 'easy' }

const state = () => store.getState()
const startSolo = (playerKey: string) => store.dispatch(roundActions.startSolo({ playerKey, puzzle: CAT }))
const guessAll = (playerKey: string, guessedLetters = ['C', 'A', 'T']) => store.dispatch(roundActions.saveSoloProgress({ playerKey, guessedLetters, hintRevealed: false }))
const countTurn = (playerKey: string) => store.dispatch(roundActions.recordPackTurn({ playerKey, roundId: state().round.solo[playerKey].id, result: 'win' }))

// Alice and Bob at the table, on the packs.
beforeEach(() => {
  store.dispatch(roundActions.reset())
  store.dispatch(profilesActions.setAll([ALICE, BOB]))
  store.dispatch(roundActions.setPnpSeatProfile({ id: 'p1', profile: ALICE }))
  store.dispatch(roundActions.setPnpSeatProfile({ id: 'p2', profile: BOB }))
  store.dispatch(roundActions.setPnpSource('packs'))
})

describe('getSeatPlayer', () => {
  it("is the seat's profile while it's on the roster, the seat's own guest once it's left it (seat 1's being Single Player's), and nothing for no seat", () => {
    expect(getSeatPlayer(state(), 'p1')).toEqual({ profileId: ALICE.id, seatId: null })
    expect(getSeatPlayerKey(state(), 'p1')).toBe(ALICE.id)
    expect(getSeatPlayer(state(), 'p9')).toBeUndefined()
    expect(getSeatPlayerKey(state(), null)).toBeUndefined()

    store.dispatch(profilesActions.setAll([ALICE]))
    expect(getSeatPlayer(state(), 'p2')).toEqual({ profileId: null, seatId: 'p2' })
    expect(getSeatPlayerKey(state(), 'p2')).toBe(guestSeatKey('p2'))

    store.dispatch(profilesActions.setAll([BOB]))
    expect(getSeatPlayer(state(), 'p1')).toEqual({ profileId: null, seatId: null })
    expect(getSeatPlayerKey(state(), 'p1')).toBe(GUEST_PLAYER_KEY)
  })

  // Each guest seat is a player of its own, never Single Player's guest.
  it("is each guest seat's own guest, keyed by the seat's id", () => {
    store.dispatch(roundActions.setPnpSeatProfile({ id: 'p2', profile: null }))
    store.dispatch(roundActions.addPnpPlayer())

    expect(getSeatPlayer(state(), 'p2')).toEqual({ profileId: null, seatId: 'p2' })
    expect(getSeatPlayerKey(state(), 'p2')).toBe('guest-p2')
    expect(getSeatPlayerKey(state(), 'p3')).toBe('guest-p3')
    expect(getSeatPlayerKey(state(), 'p2')).not.toBe(GUEST_PLAYER_KEY)
  })

  it("is the turn's player, with a turn", () => {
    expect(getTurnPlayer(state())).toBeUndefined()
    expect(getTurnPlayerKey(state())).toBeUndefined()
    store.dispatch(roundActions.startPackTurn())
    expect(getTurnPlayer(state())).toEqual({ profileId: ALICE.id, seatId: null })
    expect(getTurnPlayerKey(state())).toBe(ALICE.id)
  })
})

describe('isPackTurnUnderWay', () => {
  it('is false with no turn', () => {
    expect(isPackTurnUnderWay(state())).toBe(false)
  })

  // Even before its round is on the board: a turn whose player had nothing to draw goes on.
  it('is true for a turn not counted yet, whatever its round', () => {
    store.dispatch(roundActions.startPackTurn())
    expect(isPackTurnUnderWay(state())).toBe(true)

    startSolo(ALICE.id)
    guessAll(ALICE.id)
    expect(isPackTurnUnderWay(state())).toBe(true)
  })

  it('is false once the turn is counted and its round decided', () => {
    store.dispatch(roundActions.startPackTurn())
    startSolo(ALICE.id)
    countTurn(ALICE.id)
    guessAll(ALICE.id)

    expect(isPackTurnUnderWay(state())).toBe(false)
  })

  // The count landed, the last guess didn't (a relaunch between them): the round is played out.
  it('is true while the round counted is still unfinished on the board', () => {
    store.dispatch(roundActions.startPackTurn())
    startSolo(ALICE.id)
    guessAll(ALICE.id, ['C', 'A'])
    countTurn(ALICE.id)

    expect(isPackTurnUnderWay(state())).toBe(true)
  })

  it('is false for a counted turn whose player has a new round waiting since (from Single Player)', () => {
    store.dispatch(roundActions.startPackTurn())
    startSolo(ALICE.id)
    countTurn(ALICE.id)
    startSolo(ALICE.id)

    expect(isPackTurnUnderWay(state())).toBe(false)
  })

  it("follows the seat: a counted turn's seat taken over by someone else is over", () => {
    store.dispatch(roundActions.startPackTurn())
    startSolo(ALICE.id)
    guessAll(ALICE.id, ['C'])
    countTurn(ALICE.id)
    store.dispatch(roundActions.setPnpSeatProfile({ id: 'p1', profile: null }))
    startSolo(guestSeatKey('p1'))

    expect(isPackTurnUnderWay(state())).toBe(false)
  })

  // A guest seat's turn is its own guest's round, never Single Player's guest's (seat 1's aside).
  it("reads a guest seat's turn from its own slot", () => {
    store.dispatch(roundActions.setPnpSeatProfile({ id: 'p2', profile: null }))
    // Alice's turn first, played out, so the next is seat 2's.
    store.dispatch(roundActions.startPackTurn())
    startSolo(ALICE.id)
    guessAll(ALICE.id)
    countTurn(ALICE.id)
    store.dispatch(roundActions.startPackTurn())
    startSolo(guestSeatKey('p2'))
    guessAll(guestSeatKey('p2'), ['C'])
    countTurn(guestSeatKey('p2'))
    startSolo(GUEST_PLAYER_KEY)

    expect(isPackTurnUnderWay(state())).toBe(true)
  })

  // Seat 1's guest is Single Player's: their turn is the round Single Player picks up too, as a
  // profile's is.
  it("reads seat 1's guest's turn from Single Player's guest's slot", () => {
    store.dispatch(roundActions.setPnpSeatProfile({ id: 'p1', profile: null }))
    store.dispatch(roundActions.startPackTurn())
    startSolo(GUEST_PLAYER_KEY)
    guessAll(GUEST_PLAYER_KEY, ['C'])

    expect(getTurnPlayerKey(state())).toBe(GUEST_PLAYER_KEY)
    expect(isPackTurnUnderWay(state())).toBe(true)
  })
})

describe('getPackTurnPlan', () => {
  it('starts with the first seat, then the fair pick after the last turn, continuing one under way', () => {
    expect(getPackTurnPlan(state())).toEqual({ seatId: 'p1', continues: false })

    store.dispatch(roundActions.startPackTurn())
    expect(getPackTurnPlan(state())).toEqual({ seatId: 'p1', continues: true })

    startSolo(ALICE.id)
    countTurn(ALICE.id)
    guessAll(ALICE.id)
    expect(getPackTurnPlan(state())).toEqual({ seatId: 'p2', continues: false })
  })
})

describe('arePlayerColorsShown', () => {
  const show = (color: string, harmony: 'split-complementary' | 'triadic' = 'split-complementary') => store.dispatch(themeActions.initialize({ ...state().theme, color, harmony }))

  beforeEach(() => {
    store.dispatch(playerThemeActions.reset())
  })

  it("is whether a profile's own colors are on screen: their pick, or their profile's color", () => {
    const alice = { profileId: ALICE.id, seatId: null }
    show(BOB.color)
    expect(arePlayerColorsShown(state(), alice)).toBe(false)
    show(ALICE.color)
    expect(arePlayerColorsShown(state(), alice)).toBe(true)

    store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: ALICE.id, theme: { color: '#000000', harmony: 'triadic', profileColor: ALICE.color } }))
    expect(arePlayerColorsShown(state(), alice)).toBe(false)
    show('#000000', 'triadic')
    expect(arePlayerColorsShown(state(), alice)).toBe(true)
  })

  it("is whether a guest seat's own colors are on screen", () => {
    const seat = { profileId: null, seatId: 'p2' }
    store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: guestSeatKey('p2'), theme: { color: '#00bcd4', harmony: 'triadic' } }))
    show(BOB.color)
    expect(arePlayerColorsShown(state(), seat)).toBe(false)
    show('#00bcd4', 'triadic')
    expect(arePlayerColorsShown(state(), seat)).toBe(true)
  })

  it('takes whatever is on screen for a guest with no colors kept', () => {
    show(BOB.color)
    expect(arePlayerColorsShown(state(), { profileId: null, seatId: null })).toBe(true)
  })
})
