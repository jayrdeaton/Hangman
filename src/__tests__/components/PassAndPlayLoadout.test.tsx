import AsyncStorage from '@react-native-async-storage/async-storage'
import { defaultColors, getTriadicPalette } from '@rific/auto-paper'
import { type Profile, profilesActions } from '@tastic/profile'
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import { router } from 'expo-router'
import { BackHandler, Dimensions, View } from 'react-native'

import { LoadoutScreen } from '@/components/LoadoutScreen'
import { Providers } from '@/components/Providers'
import { DEFAULT_MODE } from '@/modes/registry'
import { achievementsActions } from '@/redux/achievementsSlice'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { playerSettingsActions } from '@/redux/playerSettingsSlice'
import { DEFAULT_HARMONY, playerThemeActions } from '@/redux/playerThemeSlice'
import { roundActions, type SavedPuzzle, selectSoloRound } from '@/redux/roundSlice'
import { store } from '@/redux/store'
import { GUEST_PLAYER_KEY, guestSeatKey } from '@/utils/players'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'

// The Pass & Play page (Jay, 2026-10-18): the Single Player page's layout, with the table in place of
// the one player (seats with focus, Add player, remove, standings badges, New session) and the word
// source under the art, and its Ready on the packs (pack turns). Ready while the players write, and New
// session, are PnpFlow.test.tsx's.

// The art carousel has its own suite (ArtCarousel.test.tsx), and runs no demo loop here.
jest.mock('@/components/ArtCarousel', () => {
  const { createElement } = jest.requireActual('react')
  const { Text } = jest.requireActual('react-native')
  return { ART_CAROUSEL_CHROME_HEIGHT: 52, ArtCarousel: ({ paused, artHeight }: { paused: boolean; artHeight: number }) => createElement(Text, { testID: 'art-carousel', accessibilityHint: String(artHeight) }, paused ? 'paused' : 'playing') }
})

const session = () => store.getState().round.pnp.session
const names = () => session().players.map((player) => player.name)
const active = () => store.getState().activePlayer.profileId
const CAT: SavedPuzzle = { phrase: 'CAT', modeId: DEFAULT_MODE.id, sourceMode: 'custom', difficultyTier: 'hard' }
const MANIFEST = getPuzzleManifest().filter((item) => item.count > 0)

const ALICE: Profile = { id: 'profile-a', name: 'Alice', color: '#9c27b0', tag: 'AL', createdAt: 1, updatedAt: 1 }
const BOB: Profile = { id: 'profile-b', name: 'Bob', color: '#4caf50', tag: 'BO', createdAt: 2, updatedAt: 2 }

// A word in play for the current pick, and the same round won and counted.
const putWordInPlay = () => {
  store.dispatch(roundActions.startPnpAuthoring())
  store.dispatch(roundActions.setPnpWord(CAT))
  store.dispatch(roundActions.startPnpPlaying())
}
const winRound = () => {
  putWordInPlay()
  store.dispatch(roundActions.savePnpProgress({ guessedLetters: ['C', 'A', 'T'], hintRevealed: false }))
  store.dispatch(roundActions.recordPnpResult({ roundId: store.getState().round.pnp.id, result: 'win' }))
  store.dispatch(roundActions.startPnpAuthoring())
}
const seat = (id: string, profile: Profile | null) => store.dispatch(roundActions.setPnpSeatProfile({ id, profile }))

// Android's back button: the newest listener first, stopping at the first that handles it.
type BackListener = () => boolean | null | undefined
let backListeners: BackListener[] = []
let addBackListener: jest.SpyInstance
const pressBack = () =>
  act(async () => {
    for (const listener of [...backListeners].reverse()) if (listener()) return
  })

// A seat's popover only shows once hud's useAutoAlign has measured its trigger, and the jest preset's
// View never answers measureInWindow: this one does, from near the page's top left.
let measure: jest.SpyInstance

beforeEach(() => {
  jest.clearAllMocks()
  store.dispatch(achievementsActions.reset())
  store.dispatch(roundActions.reset())
  store.dispatch(activePlayerActions.setActivePlayer(null))
  store.dispatch(playerSettingsActions.reset())
  store.dispatch(playerThemeActions.reset())
  store.dispatch(profilesActions.setAll([]))
  backListeners = []
  addBackListener = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, listener) => {
    backListeners.push(listener as BackListener)
    return {
      remove: () => {
        backListeners = backListeners.filter((item) => item !== listener)
      }
    }
  })
  measure = jest.spyOn(View.prototype as unknown as { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void }, 'measureInWindow').mockImplementation((callback) => callback(80, 160, 120, 28))
})

afterEach(() => {
  addBackListener.mockRestore()
  measure.mockRestore()
})

const renderLoadout = (mode: 'pnp' | 'solo' = 'pnp') =>
  render(
    <Providers>
      <LoadoutScreen mode={mode} />
    </Providers>
  )
type Screen = Awaited<ReturnType<typeof renderLoadout>>

// A seat's pill is named for whoever sits there, as the fleet's pickers write it.
const pill = (screen: Screen, name: string) => screen.getByLabelText(name.toUpperCase())
const ready = (screen: Screen) => screen.getByRole('button', { name: 'Ready' })

describe('the Pass & Play page', () => {
  it('seats two guests to start, the first shown, with room to add more and nothing to remove', async () => {
    const screen = await renderLoadout()

    expect(pill(screen, 'Player 1')).toBeTruthy()
    expect(pill(screen, 'Player 2')).toBeTruthy()
    expect(session().focusedId).toBe('p1')
    expect(screen.getByLabelText('Add player')).toBeTruthy()
    expect(screen.queryByLabelText(/^Remove /)).toBeNull()
    // Nothing decided yet: no standings, and no session to clear.
    expect(screen.queryByLabelText(/solved$/)).toBeNull()
    expect(screen.queryByLabelText('New session')).toBeNull()
  })

  it("has the Single Player page's layout: the art, then where the words come from, then Ready", async () => {
    const screen = await renderLoadout()

    expect(screen.getByTestId('art-carousel')).toBeTruthy()
    expect(screen.getByText('Packs')).toBeTruthy()
    expect(screen.getByText('Write-In')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ready' })).toBeTruthy()
    // No list of rows any more: the seats are pills, and the standings ride on them.
    for (const gone of ['Players', 'Standings', 'Words', 'Add Player', 'Continue', 'New Session']) expect(screen.queryByText(gone)).toBeNull()
  })

  // Guests go by their seats (Jay, 2026-10-18): there's no renaming one.
  it('offers no renaming', async () => {
    const screen = await renderLoadout()

    expect(screen.queryByLabelText(/^Rename /)).toBeNull()
    expect(screen.queryByTestId('player-name-input')).toBeNull()
  })

  describe('seats', () => {
    it('adds guests up to eight, each named for its seat, then offers no more', async () => {
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByLabelText('Add player'))
      expect(names()).toEqual(['Player 1', 'Player 2', 'Player 3'])
      expect(pill(screen, 'Player 3')).toBeTruthy()

      for (let i = 0; i < 5; i++) await fireEvent.press(screen.getByLabelText('Add player'))
      expect(names()).toHaveLength(8)
      expect(screen.queryByLabelText('Add player')).toBeNull()
    })

    it("focuses a seat on the first press, making its player the page's, and opens its picker on the next", async () => {
      store.dispatch(profilesActions.setAll([ALICE]))
      seat('p2', ALICE)
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: ALICE.id, difficulty: 'hard' }))
      store.dispatch(roundActions.setPnpSource('packs'))
      const screen = await renderLoadout()
      expect(screen.getByLabelText('ANY')).toBeTruthy()

      await fireEvent.press(pill(screen, 'Alice'))

      expect(session().focusedId).toBe('p2')
      expect(active()).toBe(ALICE.id)
      expect(screen.getByLabelText('HARD')).toBeTruthy()
      expect(screen.queryByText('Manage')).toBeNull()

      await fireEvent.press(pill(screen, 'Alice'))

      expect(screen.getByText('Manage')).toBeTruthy()
      expect(screen.getByLabelText('Color, Hangman only')).toBeTruthy()
    })

    // Whoever a game (Pass & Play hands the device around) or Single Player left playing.
    it('makes the focused seat the active player whenever the page is shown', async () => {
      store.dispatch(profilesActions.setAll([ALICE, BOB]))
      seat('p2', BOB)
      store.dispatch(roundActions.focusPnpSeat('p2'))
      store.dispatch(activePlayerActions.setActivePlayer(ALICE.id))

      await renderLoadout()

      expect(active()).toBe(BOB.id)
    })

    it('leaves the active player alone on the Single Player page', async () => {
      store.dispatch(profilesActions.setAll([ALICE, BOB]))
      seat('p1', BOB)
      store.dispatch(activePlayerActions.setActivePlayer(ALICE.id))

      const screen = await renderLoadout('solo')

      expect(active()).toBe(ALICE.id)
      expect(pill(screen, 'Alice')).toBeTruthy()
      expect(screen.queryByLabelText('Add player')).toBeNull()
      expect(screen.queryByText('Write-In')).toBeNull()
    })

    it("removes the focused seat with others to spare straight away when it'd take nothing, the guests after it moving up and the focus with them", async () => {
      store.dispatch(roundActions.addPnpPlayer())
      store.dispatch(roundActions.addPnpPlayer())
      store.dispatch(roundActions.focusPnpSeat('p2'))
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByLabelText('Remove Player 2'))

      expect(screen.queryByText('Remove Player 2?')).toBeNull()
      expect(session().players.map((player) => [player.id, player.name])).toEqual([
        ['p1', 'Player 1'],
        ['p3', 'Player 2'],
        ['p4', 'Player 3']
      ])
      expect(session().focusedId).toBe('p3')
    })

    it('offers to remove only the focused seat, and none at two', async () => {
      store.dispatch(roundActions.addPnpPlayer())
      const screen = await renderLoadout()

      expect(screen.getAllByLabelText(/^Remove /).map((button) => button.props.accessibilityLabel)).toEqual(['Remove Player 1'])
      await fireEvent.press(screen.getByLabelText('Remove Player 1'))
      expect(names()).toEqual(['Player 1', 'Player 2'])
      expect(screen.queryByLabelText(/^Remove /)).toBeNull()
    })

    it('asks first when their standing would go with them, and keeps them on Cancel', async () => {
      store.dispatch(roundActions.addPnpPlayer())
      winRound()
      store.dispatch(roundActions.focusPnpSeat('p2'))
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByLabelText('Remove Player 2'))
      expect(screen.getByText('Remove Player 2?')).toBeTruthy()
      expect(screen.getByText('Their standing this session goes with them.')).toBeTruthy()

      await fireEvent.press(screen.getByText('Cancel'))
      expect(names()).toEqual(['Player 1', 'Player 2', 'Player 3'])
      await waitFor(() => expect(screen.queryByText('Remove Player 2?')).toBeNull())

      await fireEvent.press(screen.getByLabelText('Remove Player 2'))
      await fireEvent.press(screen.getByText('Remove'))
      expect(names()).toEqual(['Player 1', 'Player 2'])
      expect(session().standings).toEqual({})
    })

    it('asks first when the word waiting on the board would go too', async () => {
      store.dispatch(roundActions.addPnpPlayer())
      putWordInPlay()
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByLabelText('Remove Player 1'))
      expect(screen.getByText('The word waiting on the board goes too.')).toBeTruthy()

      await fireEvent.press(screen.getByText('Remove'))
      expect(session().players.map((player) => player.id)).toEqual(['p2', 'p3'])
      expect(store.getState().round.pnp).toMatchObject({ phase: 'authoring', puzzle: null })
    })

    it('hands the page to the player who takes the removed seat', async () => {
      store.dispatch(profilesActions.setAll([ALICE]))
      store.dispatch(roundActions.addPnpPlayer())
      seat('p3', ALICE)
      store.dispatch(roundActions.focusPnpSeat('p2'))
      const screen = await renderLoadout()
      expect(active()).toBeNull()

      await fireEvent.press(screen.getByLabelText('Remove Player 2'))

      expect(session().focusedId).toBe('p3')
      expect(active()).toBe(ALICE.id)
    })
  })

  // Each guest seat is a player of its own (Jay, 2026-10-18): its own art, difficulty, packs, colors,
  // waiting round and unlocked puzzles, under the seat's own key, never Single Player's guest's.
  describe("each guest seat's own player", () => {
    const activePlayer = () => store.getState().activePlayer
    const colorOf = (seatId: string) => store.getState().playerTheme[guestSeatKey(seatId)]?.color
    // Every react-native-svg Circle's and Path's fill under a seat (its chip's palette: the svg mock
    // renders each as a host element of that name).
    type JsonNode = { type: string; props: Record<string, unknown>; children: (JsonNode | string)[] | null }
    const seatFills = (screen: Screen, seatId: string) => {
      const fills = { Circle: [] as unknown[], Path: [] as unknown[] }
      const walk = (node: unknown) => {
        if (!node || typeof node !== 'object') return
        if (Array.isArray(node)) return node.forEach(walk)
        const { type, props, children } = node as JsonNode
        if (type === 'Circle' || type === 'Path') fills[type].push(props.fill)
        children?.forEach(walk)
      }
      walk(screen.getByTestId(`seat-${seatId}`).toJSON())
      return fills
    }

    it("makes the focused guest seat's own guest the page's player, with their own difficulty and packs", async () => {
      store.dispatch(roundActions.setPnpSource('packs'))
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: guestSeatKey('p1'), difficulty: 'hard' }))
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: guestSeatKey('p2'), difficulty: 'easy' }))
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: guestSeatKey('p2'), packKeys: [MANIFEST[0].key] }))
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: GUEST_PLAYER_KEY, difficulty: 'medium' }))
      const screen = await renderLoadout()

      expect(activePlayer()).toEqual({ profileId: null, seatId: 'p1' })
      expect(screen.getByLabelText('HARD')).toBeTruthy()
      expect(screen.getByText(`All ${MANIFEST.length} packs`)).toBeTruthy()

      await fireEvent.press(pill(screen, 'Player 2'))

      expect(activePlayer()).toEqual({ profileId: null, seatId: 'p2' })
      expect(screen.getByLabelText('EASY')).toBeTruthy()
      expect(screen.getByText(`1 of ${MANIFEST.length} packs`)).toBeTruthy()
      expect(store.getState().playerSettings[GUEST_PLAYER_KEY]?.difficulty).toBe('medium')
    })

    it('files a pick made on the page under the focused guest seat alone', async () => {
      store.dispatch(roundActions.setPnpSource('packs'))
      store.dispatch(roundActions.focusPnpSeat('p2'))
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByLabelText('ANY'))
      await fireEvent.press(screen.getByText('Hard'))

      expect(store.getState().playerSettings[guestSeatKey('p2')]?.difficulty).toBe('hard')
      expect(store.getState().playerSettings[guestSeatKey('p1')]).toBeUndefined()
      expect(store.getState().playerSettings[GUEST_PLAYER_KEY]).toBeUndefined()
    })

    it('starts every guest seat on a color nobody else at the table is showing, spread across the wheel, in the default harmony', async () => {
      // Alice sits first in Red, and the third seat's guest already has Orange: the others land across
      // the wheel from both (see guestSeats.ts).
      const redAlice = { ...ALICE, color: defaultColors[0].value }
      store.dispatch(profilesActions.setAll([redAlice]))
      seat('p1', redAlice)
      store.dispatch(roundActions.addPnpPlayer())
      store.dispatch(roundActions.addPnpPlayer())
      store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: guestSeatKey('p3'), theme: { color: defaultColors[2].value, harmony: 'triadic' } }))
      const screen = await renderLoadout()

      expect([colorOf('p2'), colorOf('p3'), colorOf('p4')]).toEqual([defaultColors.find((color) => color.label === 'Sky')!.value, defaultColors[2].value, defaultColors.find((color) => color.label === 'Emerald')!.value])
      expect(store.getState().playerTheme[guestSeatKey('p2')]).toEqual({ color: defaultColors.find((color) => color.label === 'Sky')!.value, harmony: DEFAULT_HARMONY })
      // The seat a profile sits in keeps no colors for its guest until it's handed back.
      expect(colorOf('p1')).toBeUndefined()

      // A seat added later skips every color at the table too.
      await fireEvent.press(screen.getByLabelText('Add player'))
      expect(colorOf('p5')).toBe(defaultColors.find((color) => color.label === 'Violet')!.value)
    })

    it("draws each guest seat's pill in its own colors, and the focused seat's in the colors on screen, which are theirs", async () => {
      store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: guestSeatKey('p1'), theme: { color: '#8bc34a', harmony: 'analogous' } }))
      store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: guestSeatKey('p2'), theme: { color: '#00bcd4', harmony: 'triadic' } }))
      const screen = await renderLoadout()

      const triad = (color: string, harmony: 'analogous' | 'triadic') => {
        const { secondary, tertiary } = getTriadicPalette(color, harmony)
        return [secondary, tertiary]
      }
      await waitFor(() => expect(store.getState().theme.color).toBe('#8bc34a'))
      expect(seatFills(screen, 'p1')).toEqual({ Circle: ['#8bc34a'], Path: triad('#8bc34a', 'analogous') })
      expect(seatFills(screen, 'p2')).toEqual({ Circle: ['#00bcd4'], Path: triad('#00bcd4', 'triadic') })
    })

    it("hands the seat's own guest back their art and colors when a profile sitting there gives the seat back", async () => {
      store.dispatch(profilesActions.setAll([ALICE]))
      store.dispatch(roundActions.setPnpSource('packs'))
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: guestSeatKey('p1'), difficulty: 'hard' }))
      store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: guestSeatKey('p1'), theme: { color: '#00bcd4', harmony: 'triadic' } }))
      const screen = await renderLoadout()
      await waitFor(() => expect(store.getState().theme.color).toBe('#00bcd4'))

      await act(async () => {
        seat('p1', ALICE)
      })
      expect(activePlayer()).toEqual({ profileId: ALICE.id, seatId: null })
      expect(screen.getByLabelText('ANY')).toBeTruthy()
      await waitFor(() => expect(store.getState().theme.color).toBe(ALICE.color))
      await fireEvent.press(pill(screen, 'Alice'))
      await fireEvent.press(screen.getByText('Guest'))

      expect(activePlayer()).toEqual({ profileId: null, seatId: 'p1' })
      expect(screen.getByLabelText('HARD')).toBeTruthy()
      await waitFor(() => expect(store.getState().theme.color).toBe('#00bcd4'))
    })

    // A seated profile deleted in another game is forgotten: the seat, and the page, are its guest's.
    it("hands the page to the focused seat's own guest when its profile leaves the roster", async () => {
      store.dispatch(profilesActions.setAll([ALICE]))
      seat('p1', ALICE)
      await renderLoadout()
      expect(activePlayer()).toEqual({ profileId: ALICE.id, seatId: null })

      await act(async () => {
        store.dispatch(profilesActions.setAll([]))
      })

      expect(activePlayer()).toEqual({ profileId: null, seatId: 'p1' })
      expect(colorOf('p1')).toEqual(expect.any(String))
    })

    it('forgets everything a guest seat kept when the seat is removed, so a new seat given its id starts fresh', async () => {
      const removeItem = jest.spyOn(AsyncStorage, 'removeItem')
      store.dispatch(roundActions.addPnpPlayer())
      store.dispatch(roundActions.focusPnpSeat('p3'))
      const key = guestSeatKey('p3')
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: key, difficulty: 'hard' }))
      store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: key, theme: { color: '#00bcd4', harmony: 'triadic' } }))
      store.dispatch(roundActions.startSolo({ playerKey: key, puzzle: { phrase: 'DOG', modeId: DEFAULT_MODE.id, sourceMode: 'random' } }))
      const screen = await renderLoadout()
      expect(activePlayer()).toEqual({ profileId: null, seatId: 'p3' })

      await fireEvent.press(screen.getByLabelText('Remove Player 3'))

      expect(session().players.map((player) => player.id)).toEqual(['p1', 'p2'])
      expect(activePlayer()).toEqual({ profileId: null, seatId: 'p2' })
      expect(store.getState().playerSettings[key]).toBeUndefined()
      expect(store.getState().playerTheme[key]).toBeUndefined()
      expect(store.getState().round.solo[key]).toBeUndefined()
      expect(removeItem).toHaveBeenCalledWith(`puzzle_unlocks_v1:${key}`)

      await fireEvent.press(screen.getByLabelText('Add player'))

      expect(session().players.map((player) => player.id)).toEqual(['p1', 'p2', 'p3'])
      expect(store.getState().playerSettings[key]).toBeUndefined()
      // Across the wheel from the Red and Lime the other two guests were given.
      expect(store.getState().playerTheme[key]).toEqual({ color: defaultColors.find((color) => color.label === 'Indigo')!.value, harmony: DEFAULT_HARMONY })
      removeItem.mockRestore()
    })

    // Single Player's guest is never a table's guest seat's.
    it("hands a guest seat left playing to Single Player's own guest on the Single Player page", async () => {
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: guestSeatKey('p2'), difficulty: 'hard' }))
      store.dispatch(activePlayerActions.setActivePlayer(null, 'p2'))
      const screen = await renderLoadout('solo')

      expect(activePlayer()).toEqual({ profileId: null, seatId: null })
      expect(pill(screen, 'Guest')).toBeTruthy()
      expect(screen.getByLabelText('ANY')).toBeTruthy()
    })
  })

  // The page fits a 375x667 phone whole with up to three seats: the art takes the room the rest leaves.
  describe("the art's height", () => {
    const layout = (screen: Screen, testID: string, height: number) => fireEvent(screen.getByTestId(testID), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 343, height } } })
    const artHeight = (screen: Screen) => Number(screen.getByTestId('art-carousel').props.accessibilityHint)
    // A 375x667 phone: the page runs the screen's full height, under the corners (their 56 come off the
    // room, as the page's top padding).
    const laidOut = async (above: number, below: number, page = 667) => {
      const screen = await renderLoadout()
      await layout(screen, 'loadout-page', page)
      await layout(screen, 'loadout-above-art', above)
      await layout(screen, 'loadout-below-art', below)
      return screen
    }

    // The room under the corners, less the page above and below the art, the gap above the carousel,
    // its name and pips, and the page's breathing room.
    it('is whatever room the rest of the page leaves it', async () => {
      const screen = await laidOut(116, 236)

      expect(artHeight(screen)).toBe(667 - 56 - 116 - 236 - 20 - 52 - 16)
    })

    // Every art is a square scene, so drawn taller than wide it's no bigger: it stops at the page's
    // width less the gutters, and a tall window's room past that goes around the whole page.
    it('stops at its floor, past which the page scrolls, and at its own width', async () => {
      expect(artHeight(await laidOut(180, 400))).toBe(72)
      expect(artHeight(await laidOut(44, 100))).toBe(667 - 56 - 44 - 100 - 20 - 52 - 16)
      expect(artHeight(await laidOut(44, 100, 3000))).toBe(Dimensions.get('window').width - 32)
    })
  })

  describe('standings', () => {
    it("shows every seat's standing on its pill once a round is decided", async () => {
      store.dispatch(roundActions.addPnpPlayer())
      winRound()
      const screen = await renderLoadout()

      expect(screen.getByLabelText('Player 2: 1 of 1 solved').props.children).toBe('1/1')
      expect(screen.getByLabelText('Player 1: 0 of 0 solved').props.children).toBe('0/0')
      expect(screen.getByLabelText('Player 3: 0 of 0 solved')).toBeTruthy()
    })

    it("names a profile's badge from the roster", async () => {
      store.dispatch(profilesActions.setAll([BOB]))
      seat('p2', BOB)
      winRound()
      store.dispatch(profilesActions.update({ id: BOB.id, patch: { name: 'Bobby' } }))
      const screen = await renderLoadout()

      expect(screen.getByLabelText('Bobby: 1 of 1 solved')).toBeTruthy()
    })
  })

  describe('where the words come from', () => {
    it('starts on the players writing, with Keep Each Word and no packs or difficulty', async () => {
      const screen = await renderLoadout()

      expect(session().source).toBe('write')
      expect(screen.getByText('Keep Each Word')).toBeTruthy()
      expect(screen.queryByTestId('packs-card')).toBeNull()
      expect(screen.queryByLabelText('ANY')).toBeNull()
    })

    it("switches to the packs, showing the focused player's difficulty and packs, and back, kept with the table", async () => {
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByText('Packs'))

      expect(session().source).toBe('packs')
      expect(screen.getByLabelText('ANY')).toBeTruthy()
      expect(screen.getByText(`All ${MANIFEST.length} packs`)).toBeTruthy()
      expect(screen.queryByText('Keep Each Word')).toBeNull()

      await fireEvent.press(screen.getByText('Write-In'))
      expect(session().source).toBe('write')
      expect(screen.getByText('Keep Each Word')).toBeTruthy()
    })

    // The standings are the seat's, whichever way it played, and a written word left waiting stays for
    // when the players write again.
    it('carries the standings on through a switch of word source, leaving a written word waiting as it was', async () => {
      store.dispatch(roundActions.addPnpPlayer())
      winRound()
      putWordInPlay()
      store.dispatch(roundActions.savePnpProgress({ guessedLetters: ['C'], hintRevealed: false }))
      const written = store.getState().round.pnp
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByText('Packs'))
      expect(screen.getByLabelText('Player 2: 1 of 1 solved')).toBeTruthy()
      await fireEvent.press(ready(screen))
      expect(session().turnId).toBe('p1')
      expect({ ...store.getState().round.pnp, session: undefined }).toEqual({ ...written, session: undefined })

      await fireEvent.press(screen.getByText('Write-In'))
      expect(ready(screen).props.accessibilityHint).toBe('Continues the session')
      await fireEvent.press(ready(screen))
      expect(router.push).toHaveBeenLastCalledWith({ pathname: '/game', params: { mode: 'pnp' } })
      expect({ ...store.getState().round.pnp, session: undefined }).toEqual({ ...written, session: undefined })
    })
  })

  // The table on the packs takes turns (utils/packTurns.ts): Ready plays the turn under way or starts
  // the next, whose board is the game screen's (PackTurns.test.tsx).
  describe('Ready on the packs', () => {
    const SOLO_FROM_PNP = { pathname: '/game', params: { mode: 'solo', door: 'pnp' } }

    beforeEach(() => {
      store.dispatch(roundActions.setPnpSource('packs'))
    })

    it('starts the first turn with the first seat, whoever the page shows, on the solo game from this door', async () => {
      store.dispatch(profilesActions.setAll([ALICE]))
      seat('p2', ALICE)
      store.dispatch(roundActions.focusPnpSeat('p2'))
      const screen = await renderLoadout()

      expect(ready(screen).props.accessibilityHint).toBe('Starts with Player 1')
      await fireEvent.press(ready(screen))

      expect(session()).toMatchObject({ turnId: 'p1', recordedTurnRound: null })
      expect(router.push).toHaveBeenCalledWith(SOLO_FROM_PNP)
      // The turn's round is the game screen's to put up, and the written word's round is left alone.
      expect(selectSoloRound(store.getState().round, ALICE.id).puzzle).toBeNull()
      expect(store.getState().round.pnp.phase).toBeNull()
    })

    it("continues the turn under way, by its player's name", async () => {
      store.dispatch(profilesActions.setAll([ALICE]))
      seat('p1', ALICE)
      store.dispatch(roundActions.startPackTurn())
      store.dispatch(roundActions.focusPnpSeat('p2'))
      const screen = await renderLoadout()

      expect(ready(screen).props.accessibilityHint).toBe("Continues Alice's turn")
      await fireEvent.press(ready(screen))

      expect(session()).toMatchObject({ turnId: 'p1', recordedTurnRound: null })
      expect(router.push).toHaveBeenCalledWith(SOLO_FROM_PNP)
    })

    it('starts the next turn once the last one is counted, the fair pick after it', async () => {
      store.dispatch(profilesActions.setAll([ALICE]))
      seat('p1', ALICE)
      store.dispatch(roundActions.addPnpPlayer())
      store.dispatch(roundActions.startPackTurn())
      store.dispatch(roundActions.startSolo({ playerKey: ALICE.id, puzzle: CAT }))
      store.dispatch(roundActions.saveSoloProgress({ playerKey: ALICE.id, guessedLetters: ['C', 'A', 'T'], hintRevealed: false }))
      store.dispatch(roundActions.recordPackTurn({ playerKey: ALICE.id, roundId: 1, result: 'win' }))
      const screen = await renderLoadout()

      // Counted into the seat's badge, as a written word is.
      expect(screen.getByLabelText('Alice: 1 of 1 solved')).toBeTruthy()
      expect(ready(screen).props.accessibilityHint).toBe('Starts with Player 2')
      await fireEvent.press(ready(screen))

      expect(session()).toMatchObject({ turnId: 'p2', recordedTurnRound: null })
      expect(screen.getByLabelText('New session')).toBeTruthy()
    })

    // Their page says why (the packs card), and Ready is off on it.
    it("shows the page as the turn's player's when they have nothing to draw from, rather than playing", async () => {
      store.dispatch(profilesActions.setAll([BOB]))
      seat('p1', BOB)
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: BOB.id, packKeys: [] }))
      store.dispatch(roundActions.focusPnpSeat('p2'))
      const screen = await renderLoadout()
      expect(ready(screen).props.accessibilityState?.disabled).toBeFalsy()

      await fireEvent.press(ready(screen))

      expect(router.push).not.toHaveBeenCalled()
      expect(session()).toMatchObject({ focusedId: 'p1', turnId: null })
      expect(active()).toBe(BOB.id)
      expect(screen.getByText('Choose at least one pack to play.')).toBeTruthy()
      expect(ready(screen).props.accessibilityState?.disabled).toBe(true)
    })

    // Every puzzle comes by turns, from each player's own selection: Choose Packs' pack browser only
    // browses here.
    it("browses a pack's puzzles without playing from them", async () => {
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByLabelText(/ packs\. /))
      await fireEvent.press(within(screen.getByTestId('packs-screen-panel')).getByLabelText(`View ${MANIFEST[0].label} contents`))

      const browser = within(screen.getByTestId('pack-puzzles-panel'))
      expect(browser.getByText('Only This Pack')).toBeTruthy()
      expect(browser.queryByText('Play This Pack')).toBeNull()
    })
  })

  // Each seat's picker: who sits there, a guest or a profile.
  describe('seating profiles', () => {
    beforeEach(() => {
      store.dispatch(profilesActions.setAll([ALICE, BOB]))
    })

    // The focused seat's pill opens its picker; any other needs focusing first.
    const pick = async (screen: Screen, seatName: string, row: string) => {
      if (!screen.queryByText('Manage')) await fireEvent.press(pill(screen, seatName))
      if (!screen.queryByText('Manage')) await fireEvent.press(pill(screen, seatName))
      await fireEvent.press(screen.getByText(row))
    }

    it('lists Guest, every profile, then Manage', async () => {
      const screen = await renderLoadout()

      await fireEvent.press(pill(screen, 'Player 1'))

      expect(screen.getByText('Guest')).toBeTruthy()
      expect(screen.getByText('Alice')).toBeTruthy()
      expect(screen.getByText('Bob')).toBeTruthy()
      expect(screen.getByText('Manage')).toBeTruthy()
    })

    it("seats a profile under its own name and chip, keeping the seat's turn, and the focused seat's player is the page's at once", async () => {
      const screen = await renderLoadout()

      await pick(screen, 'Player 1', 'Alice')

      expect(session().players[0]).toEqual({ id: 'p1', name: 'Alice', profileId: ALICE.id })
      expect(session()).toMatchObject({ writerId: 'p1', guesserId: 'p2' })
      expect(pill(screen, 'Alice')).toBeTruthy()
      expect(screen.getByText('AL')).toBeTruthy()
      expect(active()).toBe(ALICE.id)
      // The popover closed with the pick.
      expect(screen.queryByText('Manage')).toBeNull()
    })

    it('sits a profile in one seat at most', async () => {
      seat('p2', ALICE)
      const screen = await renderLoadout()

      await pick(screen, 'Player 1', 'Alice')

      expect(session().players.map((player) => player.profileId)).toEqual([null, ALICE.id])
      // Still open: a taken profile's row does nothing.
      expect(screen.getByText('Manage')).toBeTruthy()
    })

    it("hands a seat back to a guest from Guest, under its own seat's Player N", async () => {
      seat('p2', BOB)
      const screen = await renderLoadout()

      await pick(screen, 'Bob', 'Guest')

      expect(session().players[1]).toEqual({ id: 'p2', name: 'Player 2', profileId: null })
      expect(pill(screen, 'Player 2')).toBeTruthy()
    })

    // A seat's standing belongs to the seat: whoever sits there next carries it on.
    it('asks before switching who sits in a seat with a standing, saying who takes it over, and keeps it on Cancel', async () => {
      winRound()
      const screen = await renderLoadout()

      await pick(screen, 'Player 2', 'Bob')

      expect(screen.getByText('Switch to Bob?')).toBeTruthy()
      expect(screen.getByText("Bob takes over Player 2's standing this session: 1 of 1 solved.")).toBeTruthy()
      expect(session().players[1].profileId).toBeNull()

      await fireEvent.press(screen.getByText('Cancel'))
      await waitFor(() => expect(screen.queryByText('Switch to Bob?')).toBeNull())
      expect(session().players[1].profileId).toBeNull()

      await pick(screen, 'Player 2', 'Bob')
      await fireEvent.press(screen.getByText('Switch'))

      expect(session().players[1]).toEqual({ id: 'p2', name: 'Bob', profileId: BOB.id })
      expect(session().standings).toEqual({ p2: { played: 1, wins: 1 } })
      expect(active()).toBe(BOB.id)
    })

    it("names the seat's guest in the confirm when handing a seat with a standing back to a guest", async () => {
      seat('p2', BOB)
      winRound()
      const screen = await renderLoadout()

      await pick(screen, 'Bob', 'Guest')

      expect(screen.getByText('Switch to Player 2?')).toBeTruthy()
      expect(screen.getByText("Player 2 takes over Bob's standing this session: 1 of 1 solved.")).toBeTruthy()
    })

    it('switches a seat that has played nothing straight away', async () => {
      winRound()
      const screen = await renderLoadout()

      await pick(screen, 'Player 1', 'Alice')

      expect(screen.queryByText('Switch to Alice?')).toBeNull()
      expect(session().players[0].profileId).toBe(ALICE.id)
    })

    it('opens the Profiles screen from Manage', async () => {
      const screen = await renderLoadout()

      await pick(screen, 'Player 1', 'Manage')

      expect(router.push).toHaveBeenCalledWith('/profiles')
      expect(screen.queryByText('Manage')).toBeNull()
    })

    it('closes on a press away, and when another seat is focused', async () => {
      const screen = await renderLoadout()
      await fireEvent.press(pill(screen, 'Player 1'))

      await fireEvent.press(screen.getByLabelText('Dismiss'))
      expect(screen.queryByText('Manage')).toBeNull()

      await fireEvent.press(pill(screen, 'Player 1'))
      await fireEvent.press(pill(screen, 'Player 2'))
      expect(screen.queryByText('Manage')).toBeNull()
      expect(session().focusedId).toBe('p2')
    })

    // The page's own catcher starts below the corners' strip, so the strip has one of its own.
    it("closes a seat's picker, and Difficulty's, on a press in the corners' strip", async () => {
      store.dispatch(roundActions.setPnpSource('packs'))
      const screen = await renderLoadout()
      const pressStrip = () => fireEvent.press(within(screen.getByTestId('loadout-corner-press-away', { includeHiddenElements: true })).getByLabelText('Dismiss', { includeHiddenElements: true }))

      await fireEvent.press(pill(screen, 'Player 1'))
      expect(screen.getByText('Manage')).toBeTruthy()
      await pressStrip()
      expect(screen.queryByText('Manage')).toBeNull()

      await fireEvent.press(screen.getByLabelText('ANY'))
      expect(screen.getByText('Medium')).toBeTruthy()
      await pressStrip()
      expect(screen.queryByText('Medium')).toBeNull()
    })

    it('closes an open seat picker on Android back first, then goes back', async () => {
      const screen = await renderLoadout()
      await fireEvent.press(pill(screen, 'Player 1'))

      await pressBack()
      expect(screen.queryByText('Manage')).toBeNull()
      expect(router.replace).not.toHaveBeenCalled()

      await pressBack()
      expect(router.replace).toHaveBeenCalledWith('/')
    })

    it('cancels the switch confirm on Android back, leaving the seat as it was', async () => {
      winRound()
      const screen = await renderLoadout()
      await pick(screen, 'Player 2', 'Bob')

      await pressBack()

      await waitFor(() => expect(screen.queryByText('Switch to Bob?')).toBeNull())
      expect(session().players[1].profileId).toBeNull()
      expect(router.replace).not.toHaveBeenCalled()
    })
  })
})
