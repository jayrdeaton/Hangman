import { defaultColors } from '@rific/auto-paper'
import { type Profile, profilesActions } from '@tastic/profile'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { router, useIsFocused } from 'expo-router'
import { BackHandler } from 'react-native'

import { WIN_DIALOG_DELAY_MS } from '@/components/Game'
import { GameScreen } from '@/components/GameScreen'
import { Providers } from '@/components/Providers'
import { achievementsActions } from '@/redux/achievementsSlice'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { type DifficultyFilter, playerSettingsActions } from '@/redux/playerSettingsSlice'
import { playerThemeActions } from '@/redux/playerThemeSlice'
import { roundActions, type SavedPuzzle, selectSoloRound } from '@/redux/roundSlice'
import { store } from '@/redux/store'
import { GUEST_PLAYER_KEY, guestSeatKey, type PlayerKey } from '@/utils/players'
import * as puzzlePicker from '@/utils/puzzlePicker'
import * as unlocks from '@/utils/unlocks'

// The Pass & Play table on the packs (Jay, 2026-10-18): the players take turns, each turn one player's
// own solo round from their own packs, difficulty and art, on the solo game played from the Pass & Play
// door. Ready on the page is PassAndPlayLoadout.test.tsx's.

// Every draw goes through resolvePuzzle: each player's packs draw their own word, so a test can tell
// whose board is up (Alice's CAT, Bob's DOG, the guest's EMU).
jest.mock('@/utils/puzzlePicker', () => ({
  ...jest.requireActual('@/utils/puzzlePicker'),
  resolvePuzzle: jest.fn()
}))

// The real board, noting the colors on screen as each one first draws: the keyboard keeps them.
const mockFirstDrawnIn: string[] = []
jest.mock('@/components/Game', () => {
  const actual = jest.requireActual('@/components/Game')
  const { createElement, useState } = jest.requireActual('react')
  const { store: appStore } = jest.requireActual('@/redux/store')
  const Game = (props: object) => {
    useState(() => mockFirstDrawnIn.push(appStore.getState().theme.color))
    return createElement(actual.Game, props)
  }
  return { ...actual, Game }
})

// The real unlock map (always empty under the app's AsyncStorage stub), spied so a test can wait for
// the board's one-time "anything to play?" check, which waits on it.
jest.mock('@/utils/unlocks', () => {
  const actual = jest.requireActual('@/utils/unlocks')
  return { ...actual, getPuzzleUnlockMap: jest.fn(actual.getPuzzleUnlockMap) }
})

const mockResolvePuzzle = jest.mocked(puzzlePicker.resolvePuzzle)
const mockGetPuzzleUnlockMap = jest.mocked(unlocks.getPuzzleUnlockMap)
const realGetPuzzleUnlockMap: typeof unlocks.getPuzzleUnlockMap = jest.requireActual('@/utils/unlocks').getPuzzleUnlockMap
const mockUseIsFocused = jest.mocked(useIsFocused)

const ALICE: Profile = { id: 'profile-a', name: 'Alice', color: '#9c27b0', tag: 'AL', createdAt: 1, updatedAt: 1 }
const BOB: Profile = { id: 'profile-b', name: 'Bob', color: '#4caf50', tag: 'BO', createdAt: 2, updatedAt: 2 }
const PNP_LOADOUT = { pathname: '/loadout', params: { mode: 'pnp' } }

const WORDS: Record<string, string> = { 'pack-a': 'CAT', 'pack-b': 'DOG', 'pack-g': 'EMU' }
const drawByPack: typeof puzzlePicker.resolvePuzzle = (config, packKeys) => ({ ok: true, payload: { phrase: WORDS[packKeys[0]] ?? 'FISH', mode: config.mode, sourceMode: 'random', packKey: packKeys[0], difficultyTier: 'easy', packScope: 'selection' } })

const session = () => store.getState().round.pnp.session
const stats = () => store.getState().achievements.stats
const active = () => store.getState().activePlayer.profileId
const solo = (playerKey: PlayerKey) => selectSoloRound(store.getState().round, playerKey)

type Picks = { packKeys: string[]; modeId: string; difficulty: DifficultyFilter }
const storePicks = (playerKey: PlayerKey, { packKeys, modeId, difficulty }: Picks) => {
  store.dispatch(playerSettingsActions.setPackKeys({ playerKey, packKeys }))
  store.dispatch(playerSettingsActions.setMode({ playerKey, modeId }))
  store.dispatch(playerSettingsActions.setDifficulty({ playerKey, difficulty }))
}

// Alice in the first seat and Bob in the second, each with their own packs, art and difficulty.
const seatAliceAndBob = () => {
  store.dispatch(profilesActions.setAll([ALICE, BOB]))
  store.dispatch(roundActions.setPnpSeatProfile({ id: 'p1', profile: ALICE }))
  store.dispatch(roundActions.setPnpSeatProfile({ id: 'p2', profile: BOB }))
  storePicks(ALICE.id, { packKeys: ['pack-a'], modeId: 'robot', difficulty: 'hard' })
  storePicks(BOB.id, { packKeys: ['pack-b'], modeId: 'candle', difficulty: 'easy' })
}

// A player's round left on the board, as the slice holds it.
const seedRound = (playerKey: PlayerKey, phrase: string, guessedLetters: string[] = []) => {
  const puzzle: SavedPuzzle = { phrase, modeId: 'classic', sourceMode: 'random', packKey: 'pack-a', difficultyTier: 'easy', packScope: 'selection' }
  store.dispatch(roundActions.startSolo({ playerKey, puzzle }))
  store.dispatch(roundActions.saveSoloProgress({ playerKey, guessedLetters, hintRevealed: false }))
}

// Android's back button: the newest listener first, stopping at the first that handles it.
type BackListener = () => boolean | null | undefined
let backListeners: BackListener[] = []
let addBackListener: jest.SpyInstance
const pressBack = () =>
  act(async () => {
    for (const listener of [...backListeners].reverse()) if (listener()) return
  })

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  mockFirstDrawnIn.length = 0
  mockResolvePuzzle.mockReset().mockImplementation(drawByPack)
  mockGetPuzzleUnlockMap.mockReset().mockImplementation(realGetPuzzleUnlockMap)
  mockUseIsFocused.mockImplementation(() => true)
  store.dispatch(achievementsActions.reset())
  store.dispatch(roundActions.reset())
  store.dispatch(activePlayerActions.setActivePlayer(null))
  store.dispatch(playerSettingsActions.reset())
  store.dispatch(playerThemeActions.reset())
  store.dispatch(profilesActions.setAll([]))
  store.dispatch(roundActions.setPnpSource('packs'))
  backListeners = []
  addBackListener = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, listener) => {
    backListeners.push(listener as BackListener)
    return {
      remove: () => {
        backListeners = backListeners.filter((item) => item !== listener)
      }
    }
  })
})

afterEach(() => {
  addBackListener.mockRestore()
})

const renderTurns = () =>
  render(
    <Providers>
      <GameScreen mode='solo' door='pnp' />
    </Providers>
  )
type Screen = Awaited<ReturnType<typeof renderTurns>>

// The word row's letters, '_' for each one not found yet.
const revealed = (screen: Screen): string[] => screen.getByLabelText('Secret word display').props.children[0].props.letters

// Lets the board's mount work settle: the player's unlocked puzzles are read back asynchronously, and
// the one-time "anything to play?" check waits on them.
const settle = async () => {
  await waitFor(() => expect(mockGetPuzzleUnlockMap).toHaveBeenCalled())
  await act(async () => {
    await Promise.all(mockGetPuzzleUnlockMap.mock.results.map((result) => result.value))
  })
}

const guess = async (screen: Screen, letters: string[]) => {
  for (const letter of letters) await fireEvent.press(screen.getByText(letter))
}
// Every letter of the word, then the win card's celebration.
const win = async (screen: Screen, phrase: string) => {
  await guess(screen, [...new Set(phrase.replace(/ /g, ''))])
  await act(async () => {
    jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
  })
}
// Six letters in none of the three words, then the loss card's short delay.
const lose = async (screen: Screen) => {
  await guess(screen, ['Z', 'X', 'Q', 'W', 'J', 'K'])
  await act(async () => {
    jest.runOnlyPendingTimers()
  })
}

describe("a pack turn's board", () => {
  beforeEach(seatAliceAndBob)

  // A web reload, or a relaunch with no turn left: the screen starts the fair pick's turn itself.
  it("is the turn's player's own round, drawn from their own packs, difficulty and art, in their colors", async () => {
    const screen = await renderTurns()
    await settle()

    expect(session().turnId).toBe('p1')
    expect(active()).toBe(ALICE.id)
    expect(store.getState().theme.color).toBe(ALICE.color)
    expect(mockResolvePuzzle).toHaveBeenCalledTimes(1)
    const [config, packKeys] = mockResolvePuzzle.mock.calls[0]
    expect(packKeys).toEqual(['pack-a'])
    expect(config).toMatchObject({ sourceMode: 'random', difficulty: 'hard' })
    expect(config.mode.id).toBe('robot')
    expect(solo(ALICE.id).puzzle).toMatchObject({ phrase: 'CAT', modeId: 'robot' })
    expect(revealed(screen)).toEqual(['_', '_', '_'])
    // Nothing of anyone else's is touched.
    expect(solo(BOB.id).puzzle).toBeNull()
  })

  // Another player's colors still on screen (the page's focused seat's, or the turn before's): the
  // board waits for the turn's player's.
  it("draws the turn's board in its player's colors, never the colors of the player before them", async () => {
    seedRound(ALICE.id, 'CAT', ['C'])
    store.dispatch(roundActions.startPackTurn())
    store.dispatch(activePlayerActions.setActivePlayer(BOB.id))
    const screen = await renderTurns()
    await settle()

    expect(revealed(screen)).toEqual(['C', '_', '_'])
    expect(store.getState().theme.color).toBe(ALICE.color)
    expect(mockFirstDrawnIn).toEqual([ALICE.color])
  })

  it("picks up the turn's player's waiting round, abandoning nothing", async () => {
    seedRound(ALICE.id, 'CAT', ['C', 'Z'])
    store.dispatch(roundActions.startPackTurn())
    const screen = await renderTurns()
    await settle()

    expect(revealed(screen)).toEqual(['C', '_', '_'])
    expect(mockResolvePuzzle).not.toHaveBeenCalled()
    expect(stats().solo.played).toBe(0)
  })

  it("counts a win once, for the turn's seat, and as the player's own solo round, never a Pass & Play one", async () => {
    const screen = await renderTurns()
    await settle()

    await win(screen, 'CAT')

    expect(session()).toMatchObject({ standings: { p1: { played: 1, wins: 1 } }, recordedTurnRound: `${ALICE.id}:1` })
    expect(stats().profiles[ALICE.id].solo).toEqual({ played: 1, wins: 1, losses: 0, draws: 0 })
    expect(stats().solo.played).toBe(1)
    expect(stats().pnp.played).toBe(0)
    expect(stats().profiles[ALICE.id].pnp.played).toBe(0)
  })

  it("shows the session on the result card: who solved it, the standings, who's up next, and End Session", async () => {
    const screen = await renderTurns()
    await settle()

    await win(screen, 'CAT')

    expect(screen.getByText('You Won!')).toBeTruthy()
    expect(screen.getByText('Alice solved it.')).toBeTruthy()
    expect(screen.getByText('Standings')).toBeTruthy()
    expect(screen.getByLabelText('Alice: 1 of 1 solved')).toBeTruthy()
    expect(screen.getByLabelText('Bob: no words guessed yet')).toBeTruthy()
    expect(screen.getByText('Bob is up next')).toBeTruthy()
    expect(screen.getByText('End Session')).toBeTruthy()
    // The solo card's own: the player's unlocks, under their name.
    expect(screen.getByText('Alice Unlocked')).toBeTruthy()
    expect(screen.getByText('First Word')).toBeTruthy()
  })

  it('says a lost turn was missed', async () => {
    const screen = await renderTurns()
    await settle()

    await lose(screen)

    expect(screen.getByText('You Lost!')).toBeTruthy()
    expect(screen.getByText('Alice missed it.')).toBeTruthy()
    expect(session().standings).toEqual({ p1: { played: 1, wins: 0 } })
    expect(stats().profiles[ALICE.id].solo.losses).toBe(1)
  })

  // Alice's and Bob's first rounds are both round 1: each counts on its own turn.
  it("hands the board to the next turn's player on Next, in their colors and from their own picks, and around the table", async () => {
    const screen = await renderTurns()
    await settle()
    await win(screen, 'CAT')

    await fireEvent.press(screen.getByText('Next'))
    await settle()

    expect(session().turnId).toBe('p2')
    expect(active()).toBe(BOB.id)
    expect(store.getState().theme.color).toBe(BOB.color)
    expect(mockResolvePuzzle).toHaveBeenCalledTimes(2)
    const [config, packKeys] = mockResolvePuzzle.mock.calls[1]
    expect(packKeys).toEqual(['pack-b'])
    expect(config.difficulty).toBe('easy')
    expect(config.mode.id).toBe('candle')
    expect(revealed(screen)).toEqual(['_', '_', '_'])
    expect(solo(BOB.id)).toMatchObject({ id: 1, puzzle: { phrase: 'DOG' } })
    expect(screen.queryByText('You Won!')).toBeNull()

    await lose(screen)
    expect(screen.getByText('Bob missed it.')).toBeTruthy()
    expect(screen.getByText('Alice is up next')).toBeTruthy()
    expect(session()).toMatchObject({ standings: { p1: { played: 1, wins: 1 }, p2: { played: 1, wins: 0 } }, recordedTurnRound: `${BOB.id}:1` })
    expect(stats().profiles[BOB.id].solo).toEqual({ played: 1, wins: 0, losses: 1, draws: 0 })

    // Back to Alice, whose decided round gives way to a fresh draw from her packs.
    await fireEvent.press(screen.getByText('Next'))
    await settle()
    expect(session().turnId).toBe('p1')
    expect(active()).toBe(ALICE.id)
    expect(solo(ALICE.id)).toMatchObject({ id: 2, puzzle: { phrase: 'CAT' }, guessedLetters: [] })
    expect(revealed(screen)).toEqual(['_', '_', '_'])
    // Every board first drawn in its own player's colors (Alice's last: her decided round, then the
    // fresh draw over it).
    expect(mockFirstDrawnIn).toEqual([ALICE.color, BOB.color, ALICE.color, ALICE.color])
  })

  it('treats Android back on the result card as Next', async () => {
    const screen = await renderTurns()
    await settle()
    await win(screen, 'CAT')

    await pressBack()
    await settle()

    expect(session().turnId).toBe('p2')
    expect(active()).toBe(BOB.id)
    expect(router.dismissTo).not.toHaveBeenCalled()
  })

  describe('End Session', () => {
    it('swaps the result card for the standings card, and Keep Playing brings it back with nothing changed', async () => {
      const screen = await renderTurns()
      await settle()
      await win(screen, 'CAT')

      await fireEvent.press(screen.getByText('End Session'))
      expect(screen.getByText('Alice Wins!')).toBeTruthy()
      expect(screen.queryByText('You Won!')).toBeNull()

      await fireEvent.press(screen.getByText('Keep Playing'))
      expect(screen.queryByText('Alice Wins!')).toBeNull()
      expect(screen.getByText('You Won!')).toBeTruthy()
      expect(session()).toMatchObject({ standings: { p1: { played: 1, wins: 1 } }, turnId: 'p1' })
    })

    it('ends the session from Done: the standings and the turn cleared, the table kept, and back to the Pass & Play loadout', async () => {
      const screen = await renderTurns()
      await settle()
      await win(screen, 'CAT')

      await fireEvent.press(screen.getByText('End Session'))
      await fireEvent.press(screen.getByText('Done'))

      expect(router.dismissTo).toHaveBeenCalledWith(PNP_LOADOUT)
      expect(session()).toMatchObject({ standings: {}, turnId: null, recordedTurnRound: null })
      expect(session().players.map((player) => player.profileId)).toEqual([ALICE.id, BOB.id])
      expect(store.getState().round.activeMode).toBeNull()
      // The stats keep the round: ending a session only clears its own standings.
      expect(stats().profiles[ALICE.id].solo.played).toBe(1)
      // The last board stays drawn while the screen leaves.
      expect(revealed(screen)).toEqual(['C', 'A', 'T'])
    })
  })

  describe('after a relaunch', () => {
    it("comes back into the turn under way, its player's board as they left it, whoever was active", async () => {
      store.dispatch(roundActions.startPackTurn())
      seedRound(ALICE.id, 'CAT', ['C', 'A', 'T'])
      store.dispatch(roundActions.recordPackTurn({ playerKey: ALICE.id, roundId: 1, result: 'win' }))
      store.dispatch(roundActions.startPackTurn())
      seedRound(BOB.id, 'DOG', ['D'])
      store.dispatch(activePlayerActions.setActivePlayer(ALICE.id))
      const screen = await renderTurns()
      await settle()

      expect(session().turnId).toBe('p2')
      expect(active()).toBe(BOB.id)
      expect(revealed(screen)).toEqual(['D', '_', '_'])
      expect(mockResolvePuzzle).not.toHaveBeenCalled()
      expect(store.getState().round).toMatchObject({ activeMode: 'solo', activeDoor: 'pnp' })
    })

    it('starts the next turn over a turn already decided, recording nothing again', async () => {
      store.dispatch(roundActions.startPackTurn())
      seedRound(ALICE.id, 'CAT', ['C', 'A', 'T'])
      store.dispatch(roundActions.recordPackTurn({ playerKey: ALICE.id, roundId: 1, result: 'win' }))
      store.dispatch(activePlayerActions.setActivePlayer(ALICE.id))
      const screen = await renderTurns()
      await settle()

      expect(session()).toMatchObject({ turnId: 'p2', standings: { p1: { played: 1, wins: 1 } } })
      expect(active()).toBe(BOB.id)
      expect(solo(BOB.id).puzzle?.phrase).toBe('DOG')
      expect(revealed(screen)).toEqual(['_', '_', '_'])
      expect(screen.queryByText('You Won!')).toBeNull()
      expect(stats().solo.played).toBe(0)
    })

    // The count landed, the last guess didn't: the round is played out, and counts nothing again.
    it("plays out a counted turn's round that comes back unfinished, recording nothing twice", async () => {
      store.dispatch(roundActions.startPackTurn())
      seedRound(ALICE.id, 'CAT', ['C', 'A'])
      store.dispatch(roundActions.recordPackTurn({ playerKey: ALICE.id, roundId: 1, result: 'win' }))
      const counted = session()
      const screen = await renderTurns()
      await settle()
      expect(revealed(screen)).toEqual(['C', 'A', '_'])

      await win(screen, 'T')

      expect(screen.getByText('Alice solved it.')).toBeTruthy()
      expect(screen.getByText('Bob is up next')).toBeTruthy()
      expect(session()).toEqual(counted)
      expect(stats().solo.played).toBe(0)
    })
  })
})

describe('guest seats', () => {
  // Each guest seat is a player of its own (Jay, 2026-10-18), never Single Player's guest: its own
  // packs, difficulty and art (the first seat's draw CAT, the second's DOG, Single Player's guest's EMU).
  beforeEach(() => {
    storePicks(GUEST_PLAYER_KEY, { packKeys: ['pack-g'], modeId: 'classic', difficulty: 'any' })
    storePicks(guestSeatKey('p1'), { packKeys: ['pack-a'], modeId: 'robot', difficulty: 'hard' })
    storePicks(guestSeatKey('p2'), { packKeys: ['pack-b'], modeId: 'candle', difficulty: 'easy' })
  })

  it("plays each guest seat's own round, from its own picks and in its own colors, around the table", async () => {
    const screen = await renderTurns()
    await settle()

    expect(session().turnId).toBe('p1')
    expect(store.getState().activePlayer).toEqual({ profileId: null, seatId: 'p1' })
    expect(solo(guestSeatKey('p1'))).toMatchObject({ id: 1, puzzle: { phrase: 'CAT', modeId: 'robot' } })
    // Both seats were given colors of their own as the first one sat down to play: auto-paper's first
    // two swatches, in seat order.
    const colorOf = (seatId: string) => store.getState().playerTheme[guestSeatKey(seatId)]?.color
    // Spread across the wheel (see guestSeats.ts): Red, then Cyan.
    expect([colorOf('p1'), colorOf('p2')]).toEqual([defaultColors.find((color) => color.label === 'Red')!.value, defaultColors.find((color) => color.label === 'Cyan')!.value])
    expect(store.getState().theme.color).toBe(colorOf('p1'))
    await win(screen, 'CAT')
    expect(screen.getByText('Player 1 solved it.')).toBeTruthy()
    expect(screen.getByText('Player 2 is up next')).toBeTruthy()

    await fireEvent.press(screen.getByText('Next'))
    await settle()

    expect(session().turnId).toBe('p2')
    expect(store.getState().activePlayer).toEqual({ profileId: null, seatId: 'p2' })
    expect(store.getState().theme.color).toBe(colorOf('p2'))
    const [config, packKeys] = mockResolvePuzzle.mock.calls[1]
    expect(packKeys).toEqual(['pack-b'])
    expect(config).toMatchObject({ difficulty: 'easy' })
    expect(config.mode.id).toBe('candle')
    expect(solo(guestSeatKey('p2'))).toMatchObject({ id: 1, puzzle: { phrase: 'DOG', modeId: 'candle' } })
    expect(revealed(screen)).toEqual(['_', '_', '_'])
    expect(screen.queryByText('You Won!')).toBeNull()
    // The first seat's decided round stays in its own slot.
    expect(solo(guestSeatKey('p1'))).toMatchObject({ id: 1, puzzle: { phrase: 'CAT' } })

    await win(screen, 'DOG')
    expect(session()).toMatchObject({ standings: { p1: { played: 1, wins: 1 }, p2: { played: 1, wins: 1 } }, recordedTurnRound: `${guestSeatKey('p2')}:1` })
    expect(screen.getByText('Player 1 is up next')).toBeTruthy()
    // A guest's rounds are the device's, on no profile's bucket; Single Player's guest is untouched.
    expect(stats().solo).toMatchObject({ played: 2, wins: 2 })
    expect(stats().profiles).toEqual({})
    expect(solo(GUEST_PLAYER_KEY).puzzle).toBeNull()
    expect(mockFirstDrawnIn).toEqual([colorOf('p1'), colorOf('p2')])
  })
})

describe('leaving, and hidden', () => {
  beforeEach(seatAliceAndBob)

  it('steps back to the Pass & Play loadout on Android back, the turn kept for Ready', async () => {
    const screen = await renderTurns()
    await settle()
    await guess(screen, ['C'])

    await pressBack()

    expect(router.dismissTo).toHaveBeenCalledWith(PNP_LOADOUT)
    expect(session()).toMatchObject({ turnId: 'p1', recordedTurnRound: null })
    expect(solo(ALICE.id).guessedLetters).toEqual(['C'])
  })

  // The loadout makes its own focused seat the active player as the player goes back to it, which
  // remounts the board for them while this screen is still on its way out.
  it('draws nothing for a player made active as the screen leaves', async () => {
    const screen = await renderTurns()
    await settle()

    await fireEvent.press(screen.getByLabelText('Home'))
    mockUseIsFocused.mockImplementation(() => false)
    await act(async () => {
      store.dispatch(activePlayerActions.setActivePlayer(BOB.id))
    })
    await settle()

    expect(mockResolvePuzzle).toHaveBeenCalledTimes(1)
    expect(solo(BOB.id).puzzle).toBeNull()
    expect(active()).toBe(BOB.id)
  })

  // The web keeps a left screen mounted, and the loadout puts its own focused seat back.
  it("leaves the active player alone while the screen isn't the one showing", async () => {
    mockUseIsFocused.mockImplementation(() => false)
    await renderTurns()
    await settle()

    expect(active()).toBeNull()
  })
})
