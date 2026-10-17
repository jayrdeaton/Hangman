import AsyncStorage from '@react-native-async-storage/async-storage'
import { type AutoPaperTheme, getColorRoles, useAutoPaperTheme } from '@rific/auto-paper'
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import * as ExpoRouter from 'expo-router'
import { router, useIsFocused } from 'expo-router'
import { useEffect } from 'react'
import { BackHandler, StyleSheet } from 'react-native'

import { LoadoutScreen } from '@/components/LoadoutScreen'
import { Providers } from '@/components/Providers'
import { DEFAULT_MODE, lettersMode, robotMode } from '@/modes/registry'
import { achievementsActions } from '@/redux/achievementsSlice'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { playerSettingsActions } from '@/redux/playerSettingsSlice'
import { roundActions, selectSoloRound } from '@/redux/roundSlice'
import { store } from '@/redux/store'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { GUEST_PLAYER_KEY } from '@/utils/players'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'
import { resolvePuzzle } from '@/utils/puzzlePicker'

jest.mock('@/utils/alert', () => ({
  alert: jest.fn().mockResolvedValue(undefined),
  confirm: jest.fn().mockResolvedValue(true)
}))

// Still the real draw (every puzzle below comes out of the real catalog), only watched, so a test can
// check which packs, art and difficulty a start asked for.
jest.mock('@/utils/puzzlePicker', () => {
  const actual = jest.requireActual('@/utils/puzzlePicker')
  return { ...actual, resolvePuzzle: jest.fn(actual.resolvePuzzle) }
})

// The art itself isn't this screen's concern (see GameVisual's and the modes' own suites), and every
// thumbnail in the Settings sheet's ART grid would otherwise draw a real SVG scene.
jest.mock('@/components/GameVisual', () => {
  const { createElement } = jest.requireActual('react')
  const { View } = jest.requireActual('react-native')
  return { GameVisual: ({ mode }: { mode: { id: string } }) => createElement(View, { testID: `game-visual-${mode.id}` }) }
})

const mockAlert = jest.mocked(alert)
const mockResolvePuzzle = jest.mocked(resolvePuzzle)
const mockRouter = jest.mocked(router)
const mockUseIsFocused = jest.mocked(useIsFocused)

// Real packs from the real manifest, filtered the way the loadout filters it. PackSelectionProvider
// starts on every pack (the player has picked nothing: the playerSettings slice is reset before each
// test), so these are also the first two Quick Start rows.
const MANIFEST = getPuzzleManifest().filter((item) => item.count > 0)
const [PACK_A, PACK_B] = MANIFEST
const GAME_HREF = { pathname: '/game', params: { mode: 'solo' } }

// The real store: the round slice is what the loadout starts and continues, and the stats are what an
// abandon records. Everything is the guest's unless a test says otherwise.
const soloRound = (playerKey = GUEST_PLAYER_KEY) => selectSoloRound(store.getState().round, playerKey)
const stats = () => store.getState().achievements.stats
const saveGuesses = (guessedLetters: string[], playerKey = GUEST_PLAYER_KEY) => store.dispatch(roundActions.saveSoloProgress({ playerKey, guessedLetters, hintRevealed: false }))

// A solo round as the game screen leaves it: a DOG puzzle on the Classic art (six mistakes), with
// whatever guesses are already on the board.
const seedSoloRound = (guessedLetters: string[] = [], playerKey = GUEST_PLAYER_KEY) => {
  store.dispatch(roundActions.startSolo({ playerKey, puzzle: { phrase: 'DOG', modeId: DEFAULT_MODE.id, sourceMode: 'random', packKey: PACK_A.key, packLabel: PACK_A.label, puzzleId: 'seeded-puzzle', difficultyTier: 'easy', packScope: 'selection' } }))
  if (guessedLetters.length > 0) saveGuesses(guessedLetters, playerKey)
  return soloRound(playerKey)
}

const renderLoadout = () =>
  render(
    <Providers>
      <LoadoutScreen mode='solo' />
    </Providers>
  )

// success/warning/danger only exist on the theme auto-paper's Provider computes, so the difficulty
// color tests read the app's real theme through a probe rendered inside Providers, rather than
// guessing at values.
let capturedTheme: AutoPaperTheme | null = null
const ThemeCapture = () => {
  const theme = useAutoPaperTheme()
  useEffect(() => {
    capturedTheme = theme
  }, [theme])
  return null
}
const renderLoadoutWithTheme = async () => {
  capturedTheme = null
  const utils = await render(
    <Providers>
      <ThemeCapture />
      <LoadoutScreen mode='solo' />
    </Providers>
  )
  return { ...utils, theme: capturedTheme! }
}

type Screen = Awaited<ReturnType<typeof renderLoadout>>

// auto-paper's palette swatch, beside the Colors row's label (it carries no label of its own).
const paletteTrigger = (screen: Screen) => {
  const [, swatch] = screen.getByTestId('colors-row').children
  if (typeof swatch === 'string') throw new Error('expected the palette trigger beside the label')
  return swatch
}

const checkedState = (screen: Screen, label: string) => screen.getByText(label).parent?.parent?.props.accessibilityState?.checked
const panelHidden = (screen: Screen, testID: string) => screen.getByTestId(testID, { includeHiddenElements: true }).props.accessibilityElementsHidden

// Art is picked in the Settings sheet (the header's cog), from its ART grid (see ArtPicker): a tap
// picks it, and Done closes the sheet.
const pickLettersArt = async (screen: Screen) => {
  await fireEvent.press(screen.getByLabelText('Settings'))
  await fireEvent.press(screen.getByRole('button', { name: `${lettersMode.label} art` }))
  await fireEvent.press(screen.getByText('Done'))
}

// Android's back button, as React Native's BackHandler runs it (BackHandler.android.js): listeners in
// the order they were added, dropped on remove(), and a press walks them newest first until one
// returns true. Jest runs as iOS, whose BackHandler never calls anything, so this stands in for it.
// The order matters here: LoadoutShell adds its own listener once per focus, and hud's ConfirmDialog
// adds one each time it opens, so the confirm's always runs first.
type BackListener = Parameters<typeof BackHandler.addEventListener>[1]
const backListeners: BackListener[] = []
// No listener on this page reads the press event itself.
const BACK_PRESS = {} as Parameters<BackListener>[0]
const installAndroidBack = () =>
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    if (!backListeners.includes(handler)) backListeners.push(handler)
    return {
      remove: () => {
        const index = backListeners.indexOf(handler)
        if (index !== -1) backListeners.splice(index, 1)
      }
    }
  })
const pressAndroidBack = async () => {
  let handled = false
  await act(async () => {
    for (let i = backListeners.length - 1; i >= 0 && !handled; i--) handled = Boolean(backListeners[i](BACK_PRESS))
  })
  return handled
}

// The global mock's useFocusEffect only cleans up on unmount. The real one also cleans up on blur (a
// share link pushed over the page, the web's browser back) and runs again on focus, which this stand-in
// does by following useIsFocused, so a rerender with it false blurs the page.
const useFocusEffectFollowingFocus = (effect: Parameters<typeof ExpoRouter.useFocusEffect>[0]) => {
  const focused = ExpoRouter.useIsFocused()
  useEffect(() => (focused ? effect() : undefined), [effect, focused])
}
const setFocused = async (screen: Screen, focused: boolean) => {
  mockUseIsFocused.mockReturnValue(focused)
  await screen.rerender(
    <Providers>
      <LoadoutScreen mode='solo' />
    </Providers>
  )
}

describe('LoadoutScreen (Single Player)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    store.dispatch(achievementsActions.reset())
    store.dispatch(roundActions.reset())
    store.dispatch(activePlayerActions.setActivePlayer(null))
    store.dispatch(playerSettingsActions.reset())
  })

  // Every list on the page (Quick Start and the drawers' lists) batches its cell
  // updates behind VirtualizedList's own 50ms timer. Letting that land inside act, before RNTL's
  // cleanup unmounts the page, keeps it from firing as an un-acted update between tests.
  afterEach(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
  })

  describe('starting a puzzle', () => {
    it('draws Random from the whole selection with the current art and difficulty, starts it as the solo round and opens the game', async () => {
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByText('Hard'))
      await pickLettersArt(screen)
      await fireEvent.press(screen.getByText('Random'))

      expect(mockResolvePuzzle).toHaveBeenCalledTimes(1)
      const [config, packKeys] = mockResolvePuzzle.mock.calls[0]
      expect(config).toMatchObject({ sourceMode: 'random', difficulty: 'hard', mode: lettersMode })
      expect(packKeys).toEqual(MANIFEST.map((item) => item.key))
      // A draw over more than one pack keeps drawing from the selection on Next.
      expect(soloRound()).toMatchObject({ id: 1, guessedLetters: [], hintRevealed: false, puzzle: { modeId: 'letters', sourceMode: 'random', difficultyTier: 'hard', packScope: 'selection' } })
      expect(mockRouter.push).toHaveBeenCalledTimes(1)
      expect(mockRouter.push).toHaveBeenCalledWith(GAME_HREF)
      // Both picks are the player's saved ones, not just this page's state.
      expect(store.getState().playerSettings[GUEST_PLAYER_KEY]).toEqual({ modeId: 'letters', difficulty: 'hard', packKeys: null })
    })

    it('draws from just that pack when a Quick Start row is tapped', async () => {
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByText(PACK_A.label))

      expect(mockResolvePuzzle.mock.calls[0][1]).toEqual([PACK_A.key])
      // One pack means Next keeps drawing from just it.
      expect(soloRound().puzzle).toMatchObject({ packKey: PACK_A.key, packScope: 'single' })
      expect(mockRouter.push).toHaveBeenCalledWith(GAME_HREF)
    })

    it('shows a Quick Start row for each selected pack, with its unlock progress, a browse button and a remove button', async () => {
      const screen = await renderLoadout()

      expect(screen.getByText('Quick Start')).toBeTruthy()
      for (const pack of [PACK_A, PACK_B]) {
        expect(screen.getByText(pack.label)).toBeTruthy()
        expect(screen.getByLabelText(`Browse ${pack.label}`)).toBeTruthy()
        expect(screen.getByLabelText(`Remove ${pack.label} from Quick Start`)).toBeTruthy()
      }
      expect((await screen.findAllByText(`${commaString(0)} of ${commaString(PACK_A.count)} unlocked`)).length).toBeGreaterThan(0)
    })

    it("unselects a pack from its row's remove button, without starting anything", async () => {
      const screen = await renderLoadout()
      expect(screen.getByText('All Packs')).toBeTruthy()

      await fireEvent.press(screen.getByLabelText(`Remove ${PACK_A.label} from Quick Start`))

      expect(screen.queryByText(PACK_A.label)).toBeNull()
      expect(screen.getByText(PACK_B.label)).toBeTruthy()
      // The same selection Choose Packs edits, so the collection row's count follows.
      expect(screen.getByText(`${MANIFEST.length - 1} of ${MANIFEST.length} Packs`)).toBeTruthy()
      expect(store.getState().playerSettings[GUEST_PLAYER_KEY]?.packKeys).toEqual(MANIFEST.slice(1).map((item) => item.key))
      expect(mockResolvePuzzle).not.toHaveBeenCalled()
      expect(soloRound().puzzle).toBeNull()
      expect(mockRouter.push).not.toHaveBeenCalled()

      // Each removal builds on the last.
      await fireEvent.press(screen.getByLabelText(`Remove ${PACK_B.label} from Quick Start`))

      expect(screen.queryByText(PACK_B.label)).toBeNull()
      expect(screen.getByText(`${MANIFEST.length - 2} of ${MANIFEST.length} Packs`)).toBeTruthy()
    })

    // The long press it replaced was a hidden gesture.
    it('does nothing on a long press', async () => {
      const screen = await renderLoadout()

      await fireEvent(screen.getByText(PACK_A.label), 'longPress')

      expect(screen.getByText(PACK_A.label)).toBeTruthy()
      expect(screen.getByText('All Packs')).toBeTruthy()
    })

    it("opens that pack's own puzzle list from the info icon, and starts the puzzle picked from it", async () => {
      const screen = await renderLoadout()
      const puzzleFromA = getPuzzlesForCategory(PACK_A.key)[0]
      const puzzleFromB = getPuzzlesForCategory(PACK_B.key)[0]
      // Choose Packs holds a second, read-only puzzle list, hidden with it, so the default (visible
      // only) query finds just the loadout's own list, and only while it's open.
      expect(screen.queryByTestId('pack-puzzles-panel')).toBeNull()

      await fireEvent.press(screen.getByLabelText(`Browse ${PACK_A.label}`))

      expect(screen.getByTestId('pack-puzzles-panel')).toBeTruthy()
      expect(screen.getByTestId(`puzzle-row-${puzzleFromA.id}`)).toBeTruthy()
      expect(screen.queryByTestId(`puzzle-row-${puzzleFromB.id}`)).toBeNull()
      // Browsing is not a draw.
      expect(soloRound().puzzle).toBeNull()
      expect(mockRouter.push).not.toHaveBeenCalled()

      await fireEvent.press(screen.getByTestId(`puzzle-row-${puzzleFromA.id}`))

      expect(soloRound().puzzle).toMatchObject({ packKey: PACK_A.key, puzzleId: puzzleFromA.id, modeId: DEFAULT_MODE.id })
      expect(mockRouter.push).toHaveBeenCalledWith(GAME_HREF)
      // Starting closes the list, so it isn't stacked over the loadout on the way back.
      expect(screen.queryByTestId('pack-puzzles-panel')).toBeNull()
    })

    it("titles that pack's list with its name, and starts a draw from just that pack from its Play This Pack", async () => {
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByLabelText(`Browse ${PACK_A.label}`))
      const panel = screen.getByTestId('pack-puzzles-panel')
      expect(within(panel).getByRole('header', { name: PACK_A.label })).toBeTruthy()
      await fireEvent.press(within(panel).getByText('Play This Pack'))

      expect(mockResolvePuzzle.mock.calls[0][1]).toEqual([PACK_A.key])
      // One pack, so the game's Next keeps to it.
      expect(soloRound().puzzle).toMatchObject({ packKey: PACK_A.key, packScope: 'single' })
      expect(mockRouter.push).toHaveBeenCalledWith(GAME_HREF)
      // The selection itself is untouched.
      expect(screen.getByText('All Packs')).toBeTruthy()
    })

    it("narrows the selection to that pack from its list's Only This Pack, starting nothing", async () => {
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByLabelText(`Browse ${PACK_B.label}`))
      await fireEvent.press(within(screen.getByTestId('pack-puzzles-panel')).getByText('Only This Pack'))

      expect(store.getState().playerSettings[GUEST_PLAYER_KEY]?.packKeys).toEqual([PACK_B.key])
      // The list closes on the trimmed page: one Quick Start row, and Random draws from just it.
      expect(screen.queryByTestId('pack-puzzles-panel')).toBeNull()
      expect(screen.getByText(`1 of ${MANIFEST.length} Packs`)).toBeTruthy()
      expect(screen.queryByText(PACK_A.label)).toBeNull()
      expect(screen.getByText(PACK_B.label)).toBeTruthy()
      expect(soloRound().puzzle).toBeNull()
      expect(mockRouter.push).not.toHaveBeenCalled()

      // Already just this pack, so there's nothing left for it to do.
      await fireEvent.press(screen.getByLabelText(`Browse ${PACK_B.label}`))
      expect(within(screen.getByTestId('pack-puzzles-panel')).getByRole('button', { name: 'Only This Pack' }).props.accessibilityState?.disabled).toBe(true)

      await fireEvent.press(within(screen.getByTestId('pack-puzzles-panel')).getByLabelText('Close'))
      await fireEvent.press(screen.getByText('Random'))
      expect(mockResolvePuzzle.mock.calls[0][1]).toEqual([PACK_B.key])
    })

    it('turns Random off, saying why, while no pack is selected', async () => {
      const screen = await renderLoadout()
      const random = () => screen.getByRole('button', { name: 'Random' })
      expect(random().props.accessibilityState?.disabled).toBe(false)
      expect(screen.queryByText('Choose at least one pack to play Random.')).toBeNull()

      // Choose Packs' Clear, the way a player gets there.
      await fireEvent.press(screen.getByText('All Packs'))
      await fireEvent.press(within(screen.getByTestId('packs-screen-panel')).getByText('Clear'))
      await fireEvent.press(within(screen.getByTestId('packs-screen-panel')).getByLabelText('Close'))

      expect(screen.getByText(`0 of ${MANIFEST.length} Packs`)).toBeTruthy()
      expect(screen.getByText('No packs selected.')).toBeTruthy()
      expect(screen.getByText('Choose at least one pack to play Random.')).toBeTruthy()
      expect(random().props.accessibilityState?.disabled).toBe(true)
      await fireEvent.press(random())
      expect(mockResolvePuzzle).not.toHaveBeenCalled()
      expect(mockAlert).not.toHaveBeenCalled()

      // Picking a pack again turns it back on.
      await fireEvent.press(screen.getByText(`0 of ${MANIFEST.length} Packs`))
      await fireEvent.press(within(screen.getByTestId('packs-screen-panel')).getByText(PACK_A.label))
      await fireEvent.press(within(screen.getByTestId('packs-screen-panel')).getByLabelText('Close'))

      expect(random().props.accessibilityState?.disabled).toBe(false)
      expect(screen.queryByText('Choose at least one pack to play Random.')).toBeNull()
    })

    // A waiting round's Continue stays the first action, Random off under the reason.
    it('keeps Continue on while Random is off', async () => {
      seedSoloRound(['Q'])
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: GUEST_PLAYER_KEY, packKeys: [] }))
      const screen = await renderLoadout()

      expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState?.disabled).toBe(false)
      expect(screen.getByRole('button', { name: 'Random' }).props.accessibilityState?.disabled).toBe(true)
      expect(screen.getByText('Choose at least one pack to play Random.')).toBeTruthy()
    })

    it("alerts 'No Puzzles Available' and starts nothing when the selection has nothing at the difficulty", async () => {
      // A pack with no Hard puzzles, and Hard picked.
      const noHard = MANIFEST.find((item) => !item.difficultyTiers.includes('hard'))!
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: GUEST_PLAYER_KEY, packKeys: [noHard.key] }))
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: GUEST_PLAYER_KEY, difficulty: 'hard' }))
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByText('Random'))

      expect(mockAlert).toHaveBeenCalledWith('No Puzzles Available', expect.any(String))
      expect(soloRound().puzzle).toBeNull()
      expect(mockRouter.push).not.toHaveBeenCalled()
    })
  })

  describe('Continue', () => {
    it('only shows for a solo round that is still playable', async () => {
      const screen = await renderLoadout()
      expect(screen.queryByText('Continue')).toBeNull()

      // A Pass & Play word waiting is the other mode's own round, not this one's.
      await act(async () => {
        store.dispatch(roundActions.setPnpWord({ phrase: 'CAT', modeId: DEFAULT_MODE.id, sourceMode: 'custom' }))
      })
      expect(screen.queryByText('Continue')).toBeNull()

      // A fresh round waiting on the board.
      await act(async () => {
        seedSoloRound()
      })
      expect(screen.getByText('Continue')).toBeTruthy()

      // Won (every letter found), then lost (Classic's six mistakes): nothing to go back to.
      await act(async () => {
        saveGuesses(['D', 'O', 'G'])
      })
      expect(screen.queryByText('Continue')).toBeNull()
      await act(async () => {
        saveGuesses(['A', 'B', 'C', 'E', 'F', 'H'])
      })
      expect(screen.queryByText('Continue')).toBeNull()
    })

    it('goes back to the game without touching the waiting round', async () => {
      const before = seedSoloRound(['D', 'Q'])
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByText('Continue'))

      expect(mockRouter.push).toHaveBeenCalledTimes(1)
      expect(mockRouter.push).toHaveBeenCalledWith(GAME_HREF)
      expect(soloRound()).toEqual(before)
      expect(mockResolvePuzzle).not.toHaveBeenCalled()
      expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
    })
  })

  describe('abandoning a round with a guess on it', () => {
    it("asks 'Abandon This Puzzle?' before Random replaces it, holding the new puzzle back", async () => {
      const before = seedSoloRound(['Q'])
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByText('Random'))

      expect(screen.getByText('Abandon This Puzzle?')).toBeTruthy()
      expect(soloRound()).toEqual(before)
      expect(stats().solo.losses).toBe(0)
      expect(mockRouter.push).not.toHaveBeenCalled()
    })

    it("records a solo loss with the round's own wrong-guess and guess counts once confirmed, then starts the new puzzle", async () => {
      // DOG: D right, Q and X wrong.
      const before = seedSoloRound(['D', 'Q', 'X'])
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByText('Random'))
      await fireEvent.press(screen.getByText('Abandon'))

      expect(stats().solo).toMatchObject({ played: 1, losses: 1, wins: 0 })
      expect(stats()).toMatchObject({ lettersGuessed: 3, lettersCorrect: 1 })
      expect(soloRound().id).toBe(before.id + 1)
      expect(soloRound()).toMatchObject({ guessedLetters: [], hintRevealed: false, puzzle: { packScope: 'selection' } })
      expect(mockRouter.push).toHaveBeenCalledTimes(1)
      expect(mockRouter.push).toHaveBeenCalledWith(GAME_HREF)
      expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
    })

    it('keeps the old round, records nothing and stays put when canceled', async () => {
      const before = seedSoloRound(['Q'])
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByText('Random'))
      await fireEvent.press(screen.getByText('Cancel'))

      expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
      expect(soloRound()).toEqual(before)
      expect(stats().solo.losses).toBe(0)
      expect(mockRouter.push).not.toHaveBeenCalled()
      expect(screen.getByText('Continue')).toBeTruthy()
    })

    it('asks the same way for a Quick Start row and for a puzzle picked from a pack list', async () => {
      const before = seedSoloRound(['Q'])
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByText(PACK_B.label))
      expect(screen.getByText('Abandon This Puzzle?')).toBeTruthy()
      await fireEvent.press(screen.getByText('Cancel'))

      await fireEvent.press(screen.getByLabelText(`Browse ${PACK_A.label}`))
      await fireEvent.press(screen.getByTestId(`puzzle-row-${getPuzzlesForCategory(PACK_A.key)[0].id}`))
      expect(screen.getByText('Abandon This Puzzle?')).toBeTruthy()
      await fireEvent.press(screen.getByText('Cancel'))

      expect(soloRound()).toEqual(before)
      expect(mockRouter.push).not.toHaveBeenCalled()
    })

    it('switches with no confirm when the round has no guesses yet', async () => {
      const before = seedSoloRound()
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByText('Random'))

      expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
      expect(soloRound().id).toBe(before.id + 1)
      expect(stats().solo.losses).toBe(0)
      expect(mockRouter.push).toHaveBeenCalledWith(GAME_HREF)
    })

    // The game screen recorded a decided round the moment it ended, so leaving it costs nothing more.
    it('switches with no confirm, and records nothing more, when the round is already decided', async () => {
      const before = seedSoloRound(['A', 'B', 'C', 'E', 'F', 'H'])
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByText('Random'))

      expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
      expect(soloRound().id).toBe(before.id + 1)
      expect(stats().solo.played).toBe(0)
      expect(mockRouter.push).toHaveBeenCalledWith(GAME_HREF)
    })
  })

  // The art moved to the Settings sheet (2026-10-17); the palette stays on the page until the player
  // picker takes it.
  describe('colors and art', () => {
    it('starts the page with the Colors row, and has no Art row or art drawer of its own', async () => {
      const screen = await renderLoadout()

      expect(screen.getByTestId('colors-row')).toBeTruthy()
      expect(screen.queryByText('Art')).toBeNull()
      expect(screen.queryByLabelText(/Change art/)).toBeNull()
      expect(screen.queryByTestId('mode-picker-panel', { includeHiddenElements: true })).toBeNull()
    })

    it('sets the default art from the Settings sheet and applies it to the round waiting on the board, guesses and all', async () => {
      seedSoloRound(['D', 'Q'])
      const screen = await renderLoadout()

      await pickLettersArt(screen)

      expect(store.getState().playerSettings[GUEST_PLAYER_KEY]?.modeId).toBe('letters')
      expect(soloRound().puzzle?.modeId).toBe('letters')
      expect(soloRound().guessedLetters).toEqual(['D', 'Q'])
      // Cosmetic, so it never counts as abandoning anything.
      expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
      expect(stats().solo.losses).toBe(0)
    })
  })

  describe('difficulty', () => {
    it("checks the picked segment and saves it as the player's", async () => {
      const screen = await renderLoadout()
      expect(checkedState(screen, 'Any')).toBe(true)

      await fireEvent.press(screen.getByText('Medium'))

      expect(checkedState(screen, 'Medium')).toBe(true)
      expect(checkedState(screen, 'Any')).toBe(false)
      expect(store.getState().playerSettings[GUEST_PLAYER_KEY]?.difficulty).toBe('medium')
    })

    it("colors the checked segment's text with its tier's vibrant ink and every other segment's with its tier's muted ink", async () => {
      const screen = await renderLoadoutWithTheme()
      const { theme } = screen
      const textColor = (label: string) => StyleSheet.flatten(screen.getByText(label).props.style).color

      // Any, checked by default, isn't a tier: it's the theme's own primary.
      expect(textColor('Any')).toBe(theme.colors.onPrimary)

      await fireEvent.press(screen.getByText('Hard'))
      expect(textColor('Hard')).toBe(theme.colors.onDanger)
      expect(textColor('Any')).toBe(theme.colors.onPrimaryContainer)

      await fireEvent.press(screen.getByText('Easy'))
      expect(textColor('Easy')).toBe(theme.colors.onSuccess)
      expect(textColor('Hard')).toBe(theme.colors.onDangerContainer)
      expect(textColor('Medium')).toBe(theme.colors.onWarningContainer)
    })

    it("fills the checked segment with its tier's vibrant color and every other segment with its tier's container color", async () => {
      const screen = await renderLoadoutWithTheme()
      const { theme } = screen
      // Paper's SegmentedButtons has no per-segment checked background, so the loadout sets it through
      // each option's style, which lands on the segment's outer View, three parents up from its label.
      const fillOf = (label: string) => StyleSheet.flatten(screen.getByText(label).parent?.parent?.parent?.props.style).backgroundColor
      // Any's container is a tint computed from the primary (useDifficultyOptionColors), not primaryContainer.
      const anyContainer = getColorRoles(theme.colors.primary, theme.colors.surface).container

      expect(fillOf('Any')).toBe(theme.colors.primary)

      await fireEvent.press(screen.getByText('Hard'))
      expect(fillOf('Hard')).toBe(theme.colors.danger)
      expect(fillOf('Any')).toBe(anyContainer)

      await fireEvent.press(screen.getByText('Easy'))
      expect(fillOf('Easy')).toBe(theme.colors.success)
      expect(fillOf('Hard')).toBe(theme.colors.dangerContainer)
      expect(fillOf('Medium')).toBe(theme.colors.warningContainer)
    })

    // Jest has no real layout, so this pins the style that does the fitting: each segment sized to its
    // own label instead of Paper's equal quarters, which cut "Medium" short on 375pt and 360pt phones.
    it('sizes every segment to its own label instead of an equal quarter of the row', async () => {
      const screen = await renderLoadout()

      for (const label of ['Any', 'Easy', 'Medium', 'Hard']) {
        const segmentStyle = StyleSheet.flatten(screen.getByText(label).parent?.parent?.parent?.props.style)
        expect(segmentStyle).toMatchObject({ flex: 0, flexBasis: 'auto', flexGrow: 1, flexShrink: 1, minWidth: 0 })
      }
    })
  })

  describe('packs', () => {
    it('opens Choose Packs from the collection row, labeled All Packs while every pack is selected', async () => {
      const screen = await renderLoadout()

      expect(screen.getByText('All Packs')).toBeTruthy()
      await fireEvent.press(screen.getByText('All Packs'))

      expect(panelHidden(screen, 'packs-screen-panel')).toBe(false)
    })

    it('counts complete packs on the Pack Progress row and opens Pack Progress from it', async () => {
      const screen = await renderLoadout()

      expect(await screen.findByText(`0 of ${MANIFEST.length} packs complete`)).toBeTruthy()
      expect(panelHidden(screen, 'pack-progress-drawer-panel')).toBe(true)

      await fireEvent.press(screen.getByText('Pack Progress'))

      expect(panelHidden(screen, 'pack-progress-drawer-panel')).toBe(false)
    })
  })

  // Everything on the page belongs to the active player (2026-10-17): their picks, their unlocked
  // puzzles and their waiting round.
  describe("the active player's own", () => {
    const OTHER = 'profile-a'
    const setActivePlayer = (profileId: string | null) =>
      act(async () => {
        store.dispatch(activePlayerActions.setActivePlayer(profileId))
      })

    it('picks, switched with the player', async () => {
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: OTHER, difficulty: 'hard' }))
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: OTHER, packKeys: [PACK_B.key] }))
      const screen = await renderLoadout()
      expect(checkedState(screen, 'Any')).toBe(true)
      expect(screen.getByText('All Packs')).toBeTruthy()

      await setActivePlayer(OTHER)

      expect(checkedState(screen, 'Hard')).toBe(true)
      expect(screen.getByText(`1 of ${MANIFEST.length} Packs`)).toBeTruthy()
      expect(screen.queryByText(PACK_A.label)).toBeNull()
    })

    it('waiting round: Continue follows the player, and Random asks only about their own round', async () => {
      seedSoloRound(['Q'])
      const screen = await renderLoadout()
      expect(screen.getByText('Continue')).toBeTruthy()

      await setActivePlayer(OTHER)
      expect(screen.queryByText('Continue')).toBeNull()

      await fireEvent.press(screen.getByText('Random'))
      expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
      expect(soloRound(OTHER).puzzle).not.toBeNull()
      expect(soloRound().guessedLetters).toEqual(['Q'])
    })

    it('unlocked puzzles, on every count', async () => {
      const unlocked = getPuzzlesForCategory(PACK_A.key).map((puzzle) => puzzle.id)
      const getItem = jest.spyOn(AsyncStorage, 'getItem').mockImplementation((key: string) => Promise.resolve(key === `puzzle_unlocks_v1:${OTHER}` ? JSON.stringify({ [PACK_A.key]: unlocked }) : null))
      const screen = await renderLoadout()
      expect(await screen.findByText(`0 of ${MANIFEST.length} packs complete`)).toBeTruthy()

      await setActivePlayer(OTHER)

      expect(await screen.findByText(`1 of ${MANIFEST.length} packs complete`)).toBeTruthy()
      expect(screen.getAllByText(`${commaString(PACK_A.count)} of ${commaString(PACK_A.count)} unlocked`).length).toBeGreaterThan(0)
      getItem.mockRestore()
    })

    it('art, which moves only their own waiting round', async () => {
      seedSoloRound(['D'], OTHER)
      seedSoloRound(['D'])
      const screen = await renderLoadout()

      await pickLettersArt(screen)

      expect(soloRound().puzzle?.modeId).toBe('letters')
      expect(soloRound(OTHER).puzzle?.modeId).toBe(DEFAULT_MODE.id)
      expect(store.getState().playerSettings[OTHER]).toBeUndefined()
    })
  })

  describe('header and Android back', () => {
    it('titles the page Single Player', async () => {
      const screen = await renderLoadout()

      expect(screen.getByText('Single Player')).toBeTruthy()
    })

    it("goes back from the header's back arrow, to Home when there's nothing beneath", async () => {
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByLabelText('Back'))

      // The router mock's canGoBack is false, so safeBack replaces with Home.
      expect(mockRouter.replace).toHaveBeenCalledWith('/')
      expect(mockRouter.back).not.toHaveBeenCalled()
    })

    it('opens Settings from the cog', async () => {
      const screen = await renderLoadout()
      expect(screen.queryByText('KEYBOARD')).toBeNull()

      await fireEvent.press(screen.getByLabelText('Settings'))

      expect(screen.getByText('KEYBOARD')).toBeTruthy()
    })

    describe('Android back', () => {
      let addEventListener: jest.SpyInstance
      beforeEach(() => {
        backListeners.length = 0
        addEventListener = installAndroidBack()
      })
      afterEach(() => addEventListener.mockRestore())

      it('closes an open drawer first, then goes back', async () => {
        const screen = await renderLoadout()

        await fireEvent.press(screen.getByText('Pack Progress'))
        expect(panelHidden(screen, 'pack-progress-drawer-panel')).toBe(false)

        expect(await pressAndroidBack()).toBe(true)
        expect(panelHidden(screen, 'pack-progress-drawer-panel')).toBe(true)
        expect(mockRouter.replace).not.toHaveBeenCalled()

        expect(await pressAndroidBack()).toBe(true)
        // The router mock's canGoBack is false, so safeBack replaces with Home.
        expect(mockRouter.replace).toHaveBeenCalledWith('/')
      })

      // Neither is the page's to close: each dialog adds its own listener as it opens, after the page's,
      // so it runs first.
      it.each([
        ['the Settings sheet', (screen: Screen) => fireEvent.press(screen.getByLabelText('Settings'))],
        ['the palette dialog', (screen: Screen) => fireEvent.press(paletteTrigger(screen))]
      ])('closes %s first, then goes back', async (_dialog, open) => {
        const screen = await renderLoadout()

        await open(screen)
        expect(screen.getByTestId('dialog')).toBeTruthy()

        expect(await pressAndroidBack()).toBe(true)
        expect(mockRouter.replace).not.toHaveBeenCalled()
        await waitFor(() => expect(screen.queryByTestId('dialog')).toBeNull())

        expect(await pressAndroidBack()).toBe(true)
        expect(mockRouter.replace).toHaveBeenCalledWith('/')
      })

      it('cancels the abandon confirm and stays on the page', async () => {
        const before = seedSoloRound(['Q'])
        const screen = await renderLoadout()

        await fireEvent.press(screen.getByText('Random'))
        expect(await pressAndroidBack()).toBe(true)

        expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
        expect(soloRound()).toEqual(before)
        expect(mockRouter.replace).not.toHaveBeenCalled()
        expect(mockRouter.back).not.toHaveBeenCalled()
      })

      // Picking a puzzle from a pack list opens the confirm and closes the list in one commit. The
      // shell's listener is added once per focus, before the confirm's, so the confirm's runs first.
      it('cancels the abandon confirm opened from a pack list pick, and stays on the page', async () => {
        const before = seedSoloRound(['Q'])
        const screen = await renderLoadout()

        await fireEvent.press(screen.getByLabelText(`Browse ${PACK_A.label}`))
        await fireEvent.press(screen.getByTestId(`puzzle-row-${getPuzzlesForCategory(PACK_A.key)[0].id}`))
        expect(screen.getByText('Abandon This Puzzle?')).toBeTruthy()
        expect(await pressAndroidBack()).toBe(true)

        expect(mockRouter.replace).not.toHaveBeenCalled()
        expect(mockRouter.back).not.toHaveBeenCalled()
        expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
        expect(soloRound()).toEqual(before)
      })

      // Pack Progress' own picks do the same: onConfirm opens the confirm and onDismiss closes the
      // drawer, in one commit.
      it.each([
        ['puzzle pick', (panel: ReturnType<Screen['getByTestId']>) => within(panel).getByTestId(`puzzle-row-${getPuzzlesForCategory(PACK_A.key)[0].id}`)],
        ['Play This Pack', (panel: ReturnType<Screen['getByTestId']>) => within(panel).getByText('Play This Pack')]
      ])("cancels the abandon confirm opened by Pack Progress' %s, and stays on the page", async (_pick, findPick) => {
        const before = seedSoloRound(['Q'])
        const screen = await renderLoadout()

        await fireEvent.press(screen.getByText('Pack Progress'))
        await fireEvent.press(within(screen.getByTestId('pack-progress-drawer-panel')).getByText(PACK_A.label))
        await fireEvent.press(findPick(screen.getByTestId('pack-progress-drawer-panel')))
        expect(screen.getByText('Abandon This Puzzle?')).toBeTruthy()
        expect(panelHidden(screen, 'pack-progress-drawer-panel')).toBe(true)
        expect(await pressAndroidBack()).toBe(true)

        expect(mockRouter.replace).not.toHaveBeenCalled()
        expect(mockRouter.back).not.toHaveBeenCalled()
        expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
        expect(soloRound()).toEqual(before)
        expect(stats().solo.losses).toBe(0)
      })

      // Choose Packs' editor and pack browser stack over it, and only Choose Packs knows which is open
      // (its ref), so back closes them a level at a time.
      it("closes Choose Packs' editor first, leaving Choose Packs open, then Choose Packs, then goes back", async () => {
        const screen = await renderLoadout()

        await fireEvent.press(screen.getByText('All Packs'))
        await fireEvent.press(within(screen.getByTestId('packs-screen-panel')).getByText('Create'))
        expect(panelHidden(screen, 'pack-editor-panel')).toBe(false)

        expect(await pressAndroidBack()).toBe(true)
        expect(panelHidden(screen, 'pack-editor-panel')).toBe(true)
        expect(panelHidden(screen, 'packs-screen-panel')).toBe(false)

        expect(await pressAndroidBack()).toBe(true)
        expect(panelHidden(screen, 'packs-screen-panel')).toBe(true)
        expect(mockRouter.replace).not.toHaveBeenCalled()

        expect(await pressAndroidBack()).toBe(true)
        expect(mockRouter.replace).toHaveBeenCalledWith('/')
      })

      it("closes Choose Packs' pack browser first, leaving Choose Packs open, then Choose Packs, then goes back", async () => {
        const screen = await renderLoadout()

        await fireEvent.press(screen.getByText('All Packs'))
        await fireEvent.press(screen.getByLabelText(`View ${PACK_A.label} contents`))
        // The loadout's own pack list is closed, so the default (visible only) query finds just Choose
        // Packs' browser.
        expect(screen.getByTestId('pack-puzzles-panel')).toBeTruthy()

        expect(await pressAndroidBack()).toBe(true)
        expect(screen.queryByTestId('pack-puzzles-panel')).toBeNull()
        expect(panelHidden(screen, 'packs-screen-panel')).toBe(false)

        expect(await pressAndroidBack()).toBe(true)
        expect(panelHidden(screen, 'packs-screen-panel')).toBe(true)
        expect(mockRouter.replace).not.toHaveBeenCalled()

        expect(await pressAndroidBack()).toBe(true)
        expect(mockRouter.replace).toHaveBeenCalledWith('/')
      })

      // Re-adding it whenever what's open changed would put it ahead of a confirm opened in the same
      // commit (see above), so it reads what's open through refs and is added once per focus.
      it('adds its listener once, however many drawers open and close over the page', async () => {
        const screen = await renderLoadout()
        expect(addEventListener).toHaveBeenCalledTimes(1)
        const [shellListener] = backListeners

        await fireEvent.press(screen.getByText('Pack Progress'))
        await pressAndroidBack()
        await fireEvent.press(screen.getByLabelText(`Browse ${PACK_A.label}`))
        await pressAndroidBack()
        await fireEvent.press(screen.getByText('All Packs'))
        await fireEvent.press(within(screen.getByTestId('packs-screen-panel')).getByText('Create'))
        await pressAndroidBack()
        await pressAndroidBack()

        // Every press closed something, so none of them left the page.
        expect(mockRouter.replace).not.toHaveBeenCalled()
        expect(addEventListener).toHaveBeenCalledTimes(1)
        expect(backListeners).toEqual([shellListener])
      })

      it('drops its listener, without an error, when unmounted with drawers open', async () => {
        const consoleError = jest.spyOn(console, 'error')
        const screen = await renderLoadout()
        await fireEvent.press(screen.getByText('All Packs'))
        await fireEvent.press(within(screen.getByTestId('packs-screen-panel')).getByText('Create'))

        // Leaving closes every drawer on the way out (the focus effect's cleanup) as the page goes away.
        await screen.unmount()
        const errors = [...consoleError.mock.calls]
        consoleError.mockRestore()

        expect(backListeners).toEqual([])
        expect(errors).toEqual([])
      })

      describe('when the page blurs', () => {
        let focusEffect: jest.SpyInstance
        beforeEach(() => {
          focusEffect = jest.spyOn(ExpoRouter, 'useFocusEffect').mockImplementation(useFocusEffectFollowingFocus)
        })
        afterEach(() => {
          focusEffect.mockRestore()
          mockUseIsFocused.mockReturnValue(true)
        })

        // Coming back finds the page itself, not a drawer left open from before.
        it.each([
          ['Pack Progress', 'Pack Progress', 'pack-progress-drawer-panel'],
          ['Choose Packs', 'All Packs', 'packs-screen-panel']
        ])('closes %s, drops its listener, and adds it back on focus', async (_drawer, opener, testID) => {
          const screen = await renderLoadout()
          await fireEvent.press(screen.getByText(opener))
          expect(panelHidden(screen, testID)).toBe(false)

          await setFocused(screen, false)

          expect(panelHidden(screen, testID)).toBe(true)
          expect(backListeners).toEqual([])

          await setFocused(screen, true)

          expect(panelHidden(screen, testID)).toBe(true)
          expect(backListeners).toHaveLength(1)
          // Nothing open any more, so back goes straight back.
          expect(await pressAndroidBack()).toBe(true)
          expect(mockRouter.replace).toHaveBeenCalledWith('/')
        })

        // Choose Packs closes its own editor and pack browser whenever it closes.
        it("closes Choose Packs' own editor too, so it isn't left open over the page with nothing under it for back to close", async () => {
          const screen = await renderLoadout()
          await fireEvent.press(screen.getByText('All Packs'))
          await fireEvent.press(within(screen.getByTestId('packs-screen-panel')).getByText('Create'))

          await setFocused(screen, false)
          await setFocused(screen, true)

          expect(panelHidden(screen, 'packs-screen-panel')).toBe(true)
          expect(panelHidden(screen, 'pack-editor-panel')).toBe(true)
        })
      })
    })
  })
})

// Only what changed with the art's move to the Settings sheet (2026-10-17). The rest of this page (its
// Continue, Write a Word and Keep Each Word) is covered by PnpFlow.test.tsx.
describe('LoadoutScreen (Pass & Play)', () => {
  const renderPnpLoadout = () =>
    render(
      <Providers>
        <LoadoutScreen mode='pnp' />
      </Providers>
    )

  beforeEach(() => {
    jest.clearAllMocks()
    store.dispatch(achievementsActions.reset())
    store.dispatch(roundActions.reset())
    store.dispatch(activePlayerActions.setActivePlayer(null))
    store.dispatch(playerSettingsActions.reset())
  })

  it('has the Colors row under its intro, and no Art row or art drawer of its own', async () => {
    const screen = await renderPnpLoadout()

    expect(screen.getByTestId('colors-row')).toBeTruthy()
    expect(screen.queryByText('Art')).toBeNull()
    expect(screen.queryByLabelText(/Change art/)).toBeNull()
    expect(screen.queryByTestId('mode-picker-panel', { includeHiddenElements: true })).toBeNull()
  })

  // The same sheet and grid as everywhere else, so the pick reaches the Pass & Play round too.
  it("picks the player's art from the Settings sheet, redrawing the word waiting to be guessed", async () => {
    store.dispatch(roundActions.setPnpWord({ phrase: 'CAT', modeId: DEFAULT_MODE.id, sourceMode: 'custom' }))
    const screen = await renderPnpLoadout()

    await fireEvent.press(screen.getByLabelText('Settings'))
    await fireEvent.press(screen.getByRole('button', { name: `${robotMode.label} art` }))

    expect(store.getState().playerSettings[GUEST_PLAYER_KEY]?.modeId).toBe(robotMode.id)
    expect(store.getState().round.pnp.puzzle?.modeId).toBe(robotMode.id)
  })

  describe('Android back', () => {
    let addEventListener: jest.SpyInstance
    beforeEach(() => {
      backListeners.length = 0
      addEventListener = installAndroidBack()
    })
    afterEach(() => addEventListener.mockRestore())

    // No drawers of its own any more, so there's nothing for back to close first.
    it('goes straight back', async () => {
      await renderPnpLoadout()

      expect(await pressAndroidBack()).toBe(true)
      expect(mockRouter.replace).toHaveBeenCalledWith('/')
    })

    it('closes the Settings sheet first, then goes back', async () => {
      const screen = await renderPnpLoadout()

      await fireEvent.press(screen.getByLabelText('Settings'))
      expect(await pressAndroidBack()).toBe(true)
      expect(mockRouter.replace).not.toHaveBeenCalled()
      await waitFor(() => expect(screen.queryByTestId('dialog')).toBeNull())

      expect(await pressAndroidBack()).toBe(true)
      expect(mockRouter.replace).toHaveBeenCalledWith('/')
    })
  })
})
