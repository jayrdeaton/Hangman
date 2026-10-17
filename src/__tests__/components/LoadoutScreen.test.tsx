import AsyncStorage from '@react-native-async-storage/async-storage'
import { type AutoPaperTheme, getColorRoles, useAutoPaperTheme } from '@rific/auto-paper'
import { act, fireEvent, render, within } from '@testing-library/react-native'
import * as ExpoRouter from 'expo-router'
import { router, useIsFocused } from 'expo-router'
import { useEffect } from 'react'
import { BackHandler, StyleSheet } from 'react-native'

import { LoadoutScreen } from '@/components/LoadoutScreen'
import { Providers } from '@/components/Providers'
import { DEFAULT_MODE, lettersMode } from '@/modes/registry'
import { achievementsActions } from '@/redux/achievementsSlice'
import { roundActions } from '@/redux/roundSlice'
import { store } from '@/redux/store'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
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

// The art itself isn't this screen's concern (see GameVisual's and the modes' own suites), and the
// Art row plus every carousel card would otherwise draw a real SVG scene.
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
// starts on every pack (AsyncStorage is a stub that never has a saved selection), so these are also
// the first two Quick Start rows.
const MANIFEST = getPuzzleManifest().filter((item) => item.count > 0)
const [PACK_A, PACK_B] = MANIFEST
const GAME_HREF = { pathname: '/game', params: { mode: 'solo' } }

// The real store: the round slice is what the loadout starts and continues, and the stats are what an
// abandon records.
const soloRound = () => store.getState().round.solo
const stats = () => store.getState().achievements.stats

// A solo round as the game screen leaves it: a DOG puzzle on the Classic art (six mistakes), with
// whatever guesses are already on the board.
const seedSoloRound = (guessedLetters: string[] = []) => {
  store.dispatch(roundActions.startSolo({ phrase: 'DOG', modeId: DEFAULT_MODE.id, sourceMode: 'random', packKey: PACK_A.key, packLabel: PACK_A.label, puzzleId: 'seeded-puzzle', difficultyTier: 'easy', packScope: 'selection' }))
  if (guessedLetters.length > 0) store.dispatch(roundActions.saveSoloProgress({ guessedLetters, hintRevealed: false }))
  return soloRound()
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

const checkedState = (screen: Screen, label: string) => screen.getByText(label).parent?.parent?.props.accessibilityState?.checked
const panelHidden = (screen: Screen, testID: string) => screen.getByTestId(testID, { includeHiddenElements: true }).props.accessibilityElementsHidden

// Scrolling the Customize carousel is what picks an art (see ModePickerDrawer's own handleScroll). An
// offset of 0 always settles on its first card, Letters Only, whatever the drawer's width.
const pickLettersArt = async (screen: Screen) => {
  await fireEvent.press(screen.getByText(DEFAULT_MODE.label))
  await fireEvent.scroll(screen.getByTestId('mode-picker-carousel'), { nativeEvent: { contentOffset: { x: 0, y: 0 } } })
  // Closing pauses the open card's demo loop, so no art timers outlive the test.
  await fireEvent.press(within(screen.getByTestId('mode-picker-panel')).getByLabelText('Close'))
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
  })

  // Every list on the page (Quick Start, the drawers' lists, the art carousel) batches its cell
  // updates behind VirtualizedList's own 50ms timer. Letting that land inside act, before RNTL's
  // cleanup unmounts the page, keeps it from firing as an un-acted update between tests.
  afterEach(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
  })

  describe('starting a puzzle', () => {
    it('draws Random from the whole selection with the current art and difficulty, starts it as the solo round and opens the game', async () => {
      const setItem = jest.spyOn(AsyncStorage, 'setItem')
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
      // Both picks are the persisted defaults, not just this page's state.
      expect(setItem).toHaveBeenCalledWith('defaultDifficulty', 'hard')
      expect(setItem).toHaveBeenCalledWith('defaultModeId', 'letters')
      setItem.mockRestore()
    })

    it('draws from just that pack when a Quick Start row is tapped', async () => {
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByText(PACK_A.label))

      expect(mockResolvePuzzle.mock.calls[0][1]).toEqual([PACK_A.key])
      // One pack means Next keeps drawing from just it.
      expect(soloRound().puzzle).toMatchObject({ packKey: PACK_A.key, packScope: 'single' })
      expect(mockRouter.push).toHaveBeenCalledWith(GAME_HREF)
    })

    it('shows a Quick Start row for each selected pack, with its unlock progress', async () => {
      const screen = await renderLoadout()

      expect(screen.getByText('Quick Start')).toBeTruthy()
      for (const pack of [PACK_A, PACK_B]) {
        expect(screen.getByText(pack.label)).toBeTruthy()
        expect(screen.getByLabelText(`Browse ${pack.label}`)).toBeTruthy()
      }
      expect((await screen.findAllByText(`${commaString(0)} of ${commaString(PACK_A.count)} unlocked`)).length).toBeGreaterThan(0)
    })

    it('unselects a pack on a long press, without starting anything', async () => {
      const screen = await renderLoadout()
      expect(screen.getByText('All Packs')).toBeTruthy()

      await fireEvent(screen.getByText(PACK_A.label), 'longPress')

      expect(screen.queryByText(PACK_A.label)).toBeNull()
      expect(screen.getByText(PACK_B.label)).toBeTruthy()
      // The same selection Choose Packs edits, so the collection row's count follows.
      expect(screen.getByText(`${MANIFEST.length - 1} of ${MANIFEST.length} Packs`)).toBeTruthy()
      expect(mockResolvePuzzle).not.toHaveBeenCalled()
      expect(soloRound().puzzle).toBeNull()
      expect(mockRouter.push).not.toHaveBeenCalled()
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

    it("starts a Random draw from just that pack from its list's own Random", async () => {
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByLabelText(`Browse ${PACK_A.label}`))
      await fireEvent.press(within(screen.getByTestId('pack-puzzles-panel')).getByText('Random'))

      expect(mockResolvePuzzle.mock.calls[0][1]).toEqual([PACK_A.key])
      expect(soloRound().puzzle).toMatchObject({ packKey: PACK_A.key, packScope: 'single' })
      expect(mockRouter.push).toHaveBeenCalledWith(GAME_HREF)
    })

    it("alerts 'No Puzzles Available' and starts nothing when nothing can be drawn", async () => {
      // A saved empty selection, read back by PackSelectionProvider on mount.
      const getItem = jest.spyOn(AsyncStorage, 'getItem').mockImplementation((key: string) => Promise.resolve(key === 'selectedPackKeys' ? '[]' : null))
      const screen = await renderLoadout()
      expect(await screen.findByText(`0 of ${MANIFEST.length} Packs`)).toBeTruthy()

      await fireEvent.press(screen.getByText('Random'))

      expect(mockAlert).toHaveBeenCalledWith('No Puzzles Available', expect.any(String))
      expect(soloRound().puzzle).toBeNull()
      expect(mockRouter.push).not.toHaveBeenCalled()
      getItem.mockRestore()
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
        store.dispatch(roundActions.saveSoloProgress({ guessedLetters: ['D', 'O', 'G'], hintRevealed: false }))
      })
      expect(screen.queryByText('Continue')).toBeNull()
      await act(async () => {
        store.dispatch(roundActions.saveSoloProgress({ guessedLetters: ['A', 'B', 'C', 'E', 'F', 'H'], hintRevealed: false }))
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

  describe('art', () => {
    it('shows the current art on its row and opens Customize from it', async () => {
      const screen = await renderLoadout()
      expect(screen.getByLabelText(`Art: ${DEFAULT_MODE.label}. Change art`)).toBeTruthy()
      expect(panelHidden(screen, 'mode-picker-panel')).toBe(true)

      await fireEvent.press(screen.getByText(DEFAULT_MODE.label))

      expect(panelHidden(screen, 'mode-picker-panel')).toBe(false)
      await fireEvent.press(within(screen.getByTestId('mode-picker-panel')).getByLabelText('Close'))
    })

    it('sets the default art and applies it to the round waiting on the board, guesses and all', async () => {
      seedSoloRound(['D', 'Q'])
      const screen = await renderLoadout()

      await pickLettersArt(screen)

      expect(screen.getByLabelText(`Art: ${lettersMode.label}. Change art`)).toBeTruthy()
      expect(soloRound().puzzle?.modeId).toBe('letters')
      expect(soloRound().guessedLetters).toEqual(['D', 'Q'])
      // Cosmetic, so it never counts as abandoning anything.
      expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
      expect(stats().solo.losses).toBe(0)
    })
  })

  describe('difficulty', () => {
    it('checks the picked segment and saves it as the default', async () => {
      const setItem = jest.spyOn(AsyncStorage, 'setItem')
      const screen = await renderLoadout()
      expect(checkedState(screen, 'Any')).toBe(true)

      await fireEvent.press(screen.getByText('Medium'))

      expect(checkedState(screen, 'Medium')).toBe(true)
      expect(checkedState(screen, 'Any')).toBe(false)
      expect(setItem).toHaveBeenCalledWith('defaultDifficulty', 'medium')
      setItem.mockRestore()
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
        ['Random', (panel: ReturnType<Screen['getByTestId']>) => within(panel).getByText('Random')]
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
        await fireEvent.press(screen.getByText(DEFAULT_MODE.label))
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

        // An open art picker would otherwise keep its demo loop running under the screen in front.
        it.each([
          ['Pack Progress', 'Pack Progress', 'pack-progress-drawer-panel'],
          ['Customize', DEFAULT_MODE.label, 'mode-picker-panel'],
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
