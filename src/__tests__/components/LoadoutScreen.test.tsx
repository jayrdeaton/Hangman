import AsyncStorage from '@react-native-async-storage/async-storage'
import { type AutoPaperTheme, defaultColors, getTriadicPalette, useAutoPaperTheme } from '@rific/auto-paper'
import { type Profile, profilesActions } from '@tastic/profile'
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import * as ExpoRouter from 'expo-router'
import { router, useIsFocused } from 'expo-router'
import { useEffect } from 'react'
import { BackHandler, StyleSheet, View } from 'react-native'
import { Avatar, Icon } from 'react-native-paper'

import { LoadoutScreen } from '@/components/LoadoutScreen'
import { Providers } from '@/components/Providers'
import { DEFAULT_MODE, lettersMode, robotMode } from '@/modes/registry'
import { achievementsActions } from '@/redux/achievementsSlice'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { playerSettingsActions } from '@/redux/playerSettingsSlice'
import { DEFAULT_HARMONY, playerThemeActions } from '@/redux/playerThemeSlice'
import { roundActions, selectSoloRound } from '@/redux/roundSlice'
import { store } from '@/redux/store'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { buildCustomPuzzle, loadCustomPacksCache } from '@/utils/customPacks'
import { packGroupColors, packGroupIcon } from '@/utils/packGroupStyle'
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

// Paper's Icon (a picker row's glyph) and Avatar.Icon (the packs card's badge), still the real ones,
// watched, to see which glyph and color each is drawn with: the icon font's mock draws neither.
jest.mock('react-native-paper', () => {
  const actual = jest.requireActual('react-native-paper')
  return { ...actual, Icon: jest.fn(actual.Icon), Avatar: { ...actual.Avatar, Icon: jest.fn(actual.Avatar.Icon) } }
})

// The art carousel has its own suite (ArtCarousel.test.tsx). Here it only shows whether the page
// asked it to pause, and runs no demo loop.
jest.mock('@/components/ArtCarousel', () => {
  const { createElement } = jest.requireActual('react')
  const { Text } = jest.requireActual('react-native')
  return { ART_CAROUSEL_CHROME_HEIGHT: 108, ArtCarousel: ({ paused }: { paused: boolean }) => createElement(Text, { testID: 'art-carousel' }, paused ? 'paused' : 'playing') }
})

const mockIcon = jest.mocked(Icon)
const mockAvatarIcon = jest.mocked(Avatar.Icon)
const mockAlert = jest.mocked(alert)
const mockResolvePuzzle = jest.mocked(resolvePuzzle)
const mockRouter = jest.mocked(router)
const mockUseIsFocused = jest.mocked(useIsFocused)

// Real packs from the real manifest, filtered the way the loadout filters it. PackSelectionProvider
// starts on every pack (the player has picked nothing: the playerSettings slice is reset before each
// test), and these are the first two Choose Packs lists.
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
// color test reads the app's real theme through a probe rendered inside Providers, rather than
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

// The pickers' popovers (the player's, Difficulty's) only show once hud's useAutoAlign has measured
// their trigger, and the jest preset's View never answers measureInWindow: this one does, from near
// the page's top, where the triggers sit.
const answerMeasureInWindow = () => jest.spyOn(View.prototype as unknown as { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void }, 'measureInWindow').mockImplementation((callback) => callback(220, 100, 140, 44))

// Every react-native-svg Circle's and Path's fill in a rendered tree (the svg mock renders each as a
// host element of that name), for reading the palette swatches.
type JsonNode = { type: string; props: Record<string, unknown>; children: (JsonNode | string)[] | null }
const svgFills = (tree: unknown): { Circle: unknown[]; Path: unknown[] } => {
  const fills = { Circle: [] as unknown[], Path: [] as unknown[] }
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    const { type, props, children } = node as JsonNode
    if (type === 'Circle' || type === 'Path') fills[type].push(props.fill)
    children?.forEach(walk)
  }
  walk(tree)
  return fills
}

// Players on the roster for the picker. A profile has to be on it to stay the active player (see
// ProfilesProvider's launch reconcile).
const ALICE: Profile = { id: 'profile-a', name: 'Alice', color: '#9c27b0', tag: 'A', createdAt: 1, updatedAt: 1 }
const BOB: Profile = { id: 'profile-b', name: 'Bob', color: '#4caf50', tag: 'B', createdAt: 2, updatedAt: 2 }

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

const N = MANIFEST.length
const ready = (screen: Screen) => screen.getByRole('button', { name: 'Ready' })
// The packs card is one button, named by what it says ("12 of 58 packs. Brands & Products, ...").
const packsCard = (screen: Screen) => screen.getByLabelText(/ packs\. /)
const choosePacks = (screen: Screen) => within(screen.getByTestId('packs-screen-panel'))
const packBrowser = (screen: Screen) => within(screen.getByTestId('pack-puzzles-panel'))
const openPackBrowser = async (screen: Screen, label: string) => {
  await fireEvent.press(packsCard(screen))
  await fireEvent.press(choosePacks(screen).getByLabelText(`View ${label} contents`))
}

// The guest's unlocked puzzles (or a profile's), as storage hands them to usePuzzleUnlocks.
const storeUnlocks = (unlocks: Record<string, Record<string, string[]>>) => jest.spyOn(AsyncStorage, 'getItem').mockImplementation((key: string) => Promise.resolve(key.startsWith('puzzle_unlocks_v1:') && unlocks[key.slice('puzzle_unlocks_v1:'.length)] ? JSON.stringify(unlocks[key.slice('puzzle_unlocks_v1:'.length)]) : null))
const everyPuzzleOf = (packKey: string) => getPuzzlesForCategory(packKey).map((puzzle) => puzzle.id)
// The packs card's icon badge, as last drawn.
const badge = () => mockAvatarIcon.mock.calls.filter(([props]) => props.testID === 'packs-card-badge').at(-1)![0]

describe('LoadoutScreen (Single Player)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    store.dispatch(achievementsActions.reset())
    store.dispatch(roundActions.reset())
    store.dispatch(activePlayerActions.setActivePlayer(null))
    store.dispatch(playerSettingsActions.reset())
    store.dispatch(playerThemeActions.reset())
    store.dispatch(profilesActions.setAll([]))
  })

  // Every list on the page (Choose Packs' and the pack browser's) batches its cell updates behind
  // VirtualizedList's own 50ms timer. Letting that land inside act, before RNTL's cleanup unmounts the
  // page, keeps it from firing as an un-acted update between tests.
  afterEach(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
  })

  // Condensed like the other games' loadouts (Jay, 2026-10-18).
  it('is the player picker and Difficulty with the reset, the art carousel, the packs card and Ready, and nothing of the old page', async () => {
    const screen = await renderLoadout()

    expect(screen.getByTestId('art-carousel')).toBeTruthy()
    expect(screen.getByLabelText('ANY')).toBeTruthy()
    expect(screen.getByLabelText('Reset settings')).toBeTruthy()
    expect(screen.getByText(`All ${N} packs`)).toBeTruthy()
    expect(screen.getByLabelText('GUEST')).toBeTruthy()
    expect(ready(screen)).toBeTruthy()
    for (const gone of ['Quick Start', 'Pack Progress', 'All Packs', 'Random', 'Continue', 'Player', 'Difficulty']) expect(screen.queryByText(gone)).toBeNull()
    expect(screen.queryByTestId('pack-progress-drawer-panel', { includeHiddenElements: true })).toBeNull()
  })

  // Back on the page (Jay, 2026-10-18), and never animating out of sight.
  describe('the art carousel', () => {
    const carouselState = (screen: Screen) => screen.getByTestId('art-carousel').props.children

    it('plays while the page is in view', async () => {
      const screen = await renderLoadout()

      expect(carouselState(screen)).toBe('playing')
    })

    it.each([
      ['the Settings sheet is open', (screen: Screen) => fireEvent.press(screen.getByLabelText('Settings'))],
      ['Choose Packs is open', (screen: Screen) => fireEvent.press(packsCard(screen))],
      ["the player picker's popover is open", (screen: Screen) => fireEvent.press(screen.getByLabelText('GUEST'))],
      ["Difficulty's popover is open", (screen: Screen) => fireEvent.press(screen.getByLabelText('ANY'))],
      [
        'the reset confirm is up',
        async (screen: Screen) => {
          await act(async () => {
            store.dispatch(playerSettingsActions.setDifficulty({ playerKey: GUEST_PLAYER_KEY, difficulty: 'hard' }))
          })
          await fireEvent.press(screen.getByLabelText('Reset settings'))
        }
      ],
      [
        'the abandon confirm is up',
        async (screen: Screen) => {
          await act(async () => {
            seedSoloRound(['Q'])
          })
          await openPackBrowser(screen, PACK_A.label)
          await fireEvent.press(packBrowser(screen).getByText('Play This Pack'))
        }
      ],
      ['the page is out of sight', (screen: Screen) => setFocused(screen, false)]
    ])('pauses while %s', async (_cover, cover) => {
      const measure = answerMeasureInWindow()
      const screen = await renderLoadout()

      await cover(screen)

      expect(carouselState(screen)).toBe('paused')
      measure.mockRestore()
      mockUseIsFocused.mockReturnValue(true)
    })

    it('plays again once what covered it goes', async () => {
      const screen = await renderLoadout()

      await fireEvent.press(packsCard(screen))
      expect(carouselState(screen)).toBe('paused')
      await fireEvent.press(choosePacks(screen).getByLabelText('Close'))

      expect(carouselState(screen)).toBe('playing')
    })
  })

  describe('Ready', () => {
    it("draws a new puzzle from the whole selection with the player's art and difficulty when nothing is waiting, starts it as their round and opens the game", async () => {
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: GUEST_PLAYER_KEY, difficulty: 'hard' }))
      const screen = await renderLoadout()
      await pickLettersArt(screen)
      expect(ready(screen).props.accessibilityHint).toBe('Starts a new puzzle')

      await fireEvent.press(ready(screen))

      expect(mockResolvePuzzle).toHaveBeenCalledTimes(1)
      const [config, packKeys] = mockResolvePuzzle.mock.calls[0]
      expect(config).toMatchObject({ sourceMode: 'random', difficulty: 'hard', mode: lettersMode })
      expect(packKeys).toEqual(MANIFEST.map((item) => item.key))
      // A draw over more than one pack keeps drawing from the selection on Next.
      expect(soloRound()).toMatchObject({ id: 1, guessedLetters: [], hintRevealed: false, puzzle: { modeId: 'letters', sourceMode: 'random', difficultyTier: 'hard', packScope: 'selection' } })
      expect(mockRouter.push).toHaveBeenCalledTimes(1)
      expect(mockRouter.push).toHaveBeenCalledWith(GAME_HREF)
    })

    it('picks up the round waiting on the board, guesses and all, drawing nothing and asking nothing', async () => {
      const before = seedSoloRound(['D', 'Q'])
      const screen = await renderLoadout()
      expect(ready(screen).props.accessibilityHint).toBe('Continues your puzzle')

      await fireEvent.press(ready(screen))

      expect(mockRouter.push).toHaveBeenCalledTimes(1)
      expect(mockRouter.push).toHaveBeenCalledWith(GAME_HREF)
      expect(soloRound()).toEqual(before)
      expect(mockResolvePuzzle).not.toHaveBeenCalled()
      expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
    })

    // The game screen recorded a decided round the moment it ended, so leaving it costs nothing more.
    it.each([
      ['won', ['D', 'O', 'G']],
      ['lost', ['A', 'B', 'C', 'E', 'F', 'H']]
    ])('draws a new one, with no confirm and nothing more recorded, when the round on the board is %s', async (_result, guesses) => {
      const before = seedSoloRound(guesses)
      const screen = await renderLoadout()

      await fireEvent.press(ready(screen))

      expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
      expect(mockResolvePuzzle).toHaveBeenCalledTimes(1)
      expect(soloRound().id).toBe(before.id + 1)
      expect(soloRound().guessedLetters).toEqual([])
      expect(stats().solo.played).toBe(0)
      expect(mockRouter.push).toHaveBeenCalledWith(GAME_HREF)
    })

    it('is off, with the packs card saying why, while no pack is selected and nothing is waiting', async () => {
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: GUEST_PLAYER_KEY, packKeys: [] }))
      const screen = await renderLoadout()

      expect(screen.getByText(`0 of ${N} packs`)).toBeTruthy()
      expect(screen.getByText('Choose at least one pack to play.')).toBeTruthy()
      expect(ready(screen).props.accessibilityState?.disabled).toBe(true)
      await fireEvent.press(ready(screen))
      expect(mockResolvePuzzle).not.toHaveBeenCalled()
      expect(mockAlert).not.toHaveBeenCalled()

      // Picking a pack in Choose Packs turns it back on.
      await fireEvent.press(packsCard(screen))
      await fireEvent.press(choosePacks(screen).getByText(PACK_A.label))
      await fireEvent.press(choosePacks(screen).getByLabelText('Close'))

      expect(ready(screen).props.accessibilityState?.disabled).toBe(false)
      expect(screen.queryByText('Choose at least one pack to play.')).toBeNull()
    })

    it('stays on to pick up a waiting round with no pack selected', async () => {
      seedSoloRound(['Q'])
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: GUEST_PLAYER_KEY, packKeys: [] }))
      const screen = await renderLoadout()

      expect(ready(screen).props.accessibilityState?.disabled).toBe(false)
      await fireEvent.press(ready(screen))

      expect(mockRouter.push).toHaveBeenCalledWith(GAME_HREF)
      expect(mockResolvePuzzle).not.toHaveBeenCalled()
    })

    it("alerts 'No Puzzles Available' and starts nothing when the selection has nothing at the difficulty", async () => {
      // A pack with no Hard puzzles, and Hard picked.
      const noHard = MANIFEST.find((item) => !item.difficultyTiers.includes('hard'))!
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: GUEST_PLAYER_KEY, packKeys: [noHard.key] }))
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: GUEST_PLAYER_KEY, difficulty: 'hard' }))
      const screen = await renderLoadout()

      await fireEvent.press(ready(screen))

      expect(mockAlert).toHaveBeenCalledWith('No Puzzles Available', expect.any(String))
      expect(soloRound().puzzle).toBeNull()
      expect(mockRouter.push).not.toHaveBeenCalled()
    })
  })

  // @tastic/profile's OptionPicker, on the page's popover host.
  describe('Difficulty', () => {
    let measure: jest.SpyInstance
    beforeEach(() => {
      measure = answerMeasureInWindow()
    })
    afterEach(() => measure.mockRestore())

    it("shows the player's difficulty, and saves a pick from its popover as theirs", async () => {
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByLabelText('ANY'))
      for (const tier of ['Any', 'Easy', 'Medium', 'Hard']) expect(screen.getByText(tier)).toBeTruthy()
      await fireEvent.press(screen.getByText('Hard'))

      expect(screen.getByLabelText('HARD')).toBeTruthy()
      // Picking closes the popover.
      expect(screen.queryByText('Medium')).toBeNull()
      expect(store.getState().playerSettings[GUEST_PLAYER_KEY]).toEqual({ modeId: DEFAULT_MODE.id, difficulty: 'hard', packKeys: null })
    })

    // The board's difficulty badge colors (Any is the theme's primary), drawn flat, not as a palette.
    it("colors its chip in the picked tier's own color", async () => {
      const screen = await renderLoadoutWithTheme()
      const { theme } = screen
      const chipFills = (trigger: string) =>
        screen
          .getByLabelText(trigger)
          .queryAll((node) => StyleSheet.flatten(node.props.style)?.backgroundColor !== undefined)
          .map((node) => StyleSheet.flatten(node.props.style).backgroundColor)

      expect(chipFills('ANY')).toContain(theme.colors.primary)

      await fireEvent.press(screen.getByLabelText('ANY'))
      await fireEvent.press(screen.getByText('Easy'))
      expect(chipFills('EASY')).toContain(theme.colors.success)

      await fireEvent.press(screen.getByLabelText('EASY'))
      await fireEvent.press(screen.getByText('Hard'))
      expect(chipFills('HARD')).toContain(theme.colors.danger)
      expect(svgFills(screen.getByLabelText('HARD').toJSON()).Path).toEqual([])
    })

    // @tastic/profile 0.16.1's option colors: the picked row fills with the picker's color instead.
    it("draws each row's icon in its own tier's color until it's the one picked", async () => {
      const screen = await renderLoadoutWithTheme()
      const { theme } = screen
      // The rows' icons are 13pt (the chip's is bigger).
      const rowIconColor = (source: string) => mockIcon.mock.calls.filter(([props]) => props.source === source && props.size === 13).at(-1)?.[0].color

      mockIcon.mockClear()
      await fireEvent.press(screen.getByLabelText('ANY'))

      expect(rowIconColor('signal-cellular-1')).toBe(theme.colors.success)
      expect(rowIconColor('signal-cellular-2')).toBe(theme.colors.warning)
      expect(rowIconColor('signal-cellular-3')).toBe(theme.colors.danger)
      expect(rowIconColor('all-inclusive')).not.toBe(theme.colors.primary)

      await fireEvent.press(screen.getByText('Hard'))
      mockIcon.mockClear()
      await fireEvent.press(screen.getByLabelText('HARD'))

      expect(rowIconColor('all-inclusive')).toBe(theme.colors.primary)
      expect(rowIconColor('signal-cellular-3')).not.toBe(theme.colors.danger)
    })

    it('closes on a press away, changing nothing', async () => {
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByLabelText('ANY'))
      await fireEvent.press(screen.getByLabelText('Dismiss'))

      expect(screen.queryByText('Medium')).toBeNull()
      expect(store.getState().playerSettings[GUEST_PLAYER_KEY]).toBeUndefined()
    })
  })

  // The page's main option: which packs Ready draws from.
  describe('the packs card', () => {
    it('says every pack while every pack is selected, and opens Choose Packs', async () => {
      const screen = await renderLoadout()

      expect(screen.getByText(`All ${N} packs`)).toBeTruthy()
      expect(screen.getByText('Every pack, new ones included')).toBeTruthy()
      expect(panelHidden(screen, 'packs-screen-panel')).toBe(true)

      await fireEvent.press(packsCard(screen))

      expect(panelHidden(screen, 'packs-screen-panel')).toBe(false)
    })

    it('counts the packs selected and names them in one line, cut short with exactly how many more there are', async () => {
      const selected = MANIFEST.slice(0, 12)
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: GUEST_PLAYER_KEY, packKeys: selected.map((item) => item.key) }))
      const screen = await renderLoadout()

      expect(screen.getByText(`12 of ${N} packs`)).toBeTruthy()
      const line = screen.getByText(/ and \d+ more$/).props.children as string
      const [, namesPart, more] = /^(.*) and (\d+) more$/.exec(line)!
      const shown = namesPart.split(', ')
      // The first names, in Choose Packs' order, then the rest counted.
      expect(shown).toEqual(selected.slice(0, shown.length).map((item) => item.label))
      expect(shown.length + Number(more)).toBe(12)
      expect(shown.length).toBeGreaterThan(1)
      expect(packsCard(screen).props.accessibilityLabel).toBe(`12 of ${N} packs. ${line}. 0 of ${commaString(selected.reduce((sum, item) => sum + item.count, 0))} puzzles unlocked`)
    })

    // An empty track read like a broken slider, so the bar waits until its fill shows: 1% of the
    // selection.
    it('shows how much of the selection is unlocked only from 1%', async () => {
      const big = MANIFEST.find((item) => item.count >= 200)!
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: GUEST_PLAYER_KEY, packKeys: [big.key] }))
      const screen = await renderLoadout()
      expect(within(packsCard(screen)).queryByRole('progressbar')).toBeNull()
      await screen.unmount()

      // One puzzle of 200 or more: unlocked, but under 1%.
      const getOne = storeUnlocks({ [GUEST_PLAYER_KEY]: { [big.key]: everyPuzzleOf(big.key).slice(0, 1) } })
      const one = await renderLoadout()
      expect(packsCard(one).props.accessibilityLabel).toContain(`1 of ${commaString(big.count)} puzzles unlocked`)
      expect(within(packsCard(one)).queryByRole('progressbar')).toBeNull()
      await one.unmount()
      getOne.mockRestore()

      const atOnePercent = Math.ceil(big.count / 100)
      const getSome = storeUnlocks({ [GUEST_PLAYER_KEY]: { [big.key]: everyPuzzleOf(big.key).slice(0, atOnePercent) } })
      const some = await renderLoadout()
      expect(await within(packsCard(some)).findByRole('progressbar')).toBeTruthy()
      getSome.mockRestore()
    })

    it('names a pack or two outright', async () => {
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: GUEST_PLAYER_KEY, packKeys: [PACK_B.key, PACK_A.key] }))
      const screen = await renderLoadout()

      expect(screen.getByText(`2 of ${N} packs`)).toBeTruthy()
      expect(screen.getByText(`${PACK_A.label} and ${PACK_B.label}`)).toBeTruthy()
    })

    // Choose Packs lists the player's own packs (My Packs) above the built-in ones.
    it("names the player's own packs first, as Choose Packs lists them, counting them with the rest", async () => {
      const custom = { key: 'custom:mine', label: 'My Words', createdAt: '', updatedAt: '', puzzles: [buildCustomPuzzle('custom:mine', 'My Words', { answer: 'PARIS' })!] }
      const getItem = jest.spyOn(AsyncStorage, 'getItem').mockImplementation((key: string) => Promise.resolve(key === 'custom_packs_v1' ? JSON.stringify([custom]) : null))
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: GUEST_PLAYER_KEY, packKeys: [PACK_A.key, custom.key] }))
      try {
        const screen = await renderLoadout()

        expect(await screen.findByText(`2 of ${N + 1} packs`)).toBeTruthy()
        expect(screen.getByText(`My Words and ${PACK_A.label}`)).toBeTruthy()
        // A custom pack is a category of its own (Custom), so the two are mixed.
        expect(badge().icon).toBe('format-list-checks')

        await act(async () => {
          store.dispatch(playerSettingsActions.setPackKeys({ playerKey: GUEST_PLAYER_KEY, packKeys: [custom.key] }))
        })
        expect(screen.getByText(`1 of ${N + 1} packs`)).toBeTruthy()
        expect(badge().icon).toBe(packGroupIcon(undefined))
      } finally {
        getItem.mockRestore()
        // The next test's launch reads storage again, but not before its first frame.
        await act(async () => {
          await loadCustomPacksCache()
        })
      }
    })
  })

  // The card looks like a pack row of the one category its packs share, or like a list.
  describe("the packs card's badge and tint", () => {
    const byGroup = (group: string | undefined) => MANIFEST.filter((item) => item.group === group)
    // A category with two packs in it, and a pack of another.
    const pair = byGroup(PACK_A.group).slice(0, 2)
    const other = MANIFEST.find((item) => item.group !== PACK_A.group)!
    const cardFill = (screen: Screen) => StyleSheet.flatten(screen.getByTestId('packs-card-container').props.style).backgroundColor
    const select = (packKeys: string[] | null) => store.dispatch(playerSettingsActions.setPackKeys({ playerKey: GUEST_PLAYER_KEY, packKeys }))

    it.each([
      ['one pack', [PACK_B]],
      ['two packs of one category', pair]
    ])("are that category's with %s selected", async (_case, packs) => {
      expect(new Set(packs.map((item) => item.group)).size).toBe(1)
      select(packs.map((item) => item.key))
      const screen = await renderLoadoutWithTheme()
      const colors = packGroupColors(packs[0].group, screen.theme)

      expect(badge().icon).toBe(packGroupIcon(packs[0].group))
      expect(StyleSheet.flatten(badge().style).backgroundColor).toBe(colors.color)
      expect(cardFill(screen)).toBe(colors.container)
    })

    it.each([
      ['packs of two categories', () => select([PACK_A.key, other.key])],
      ['every pack', () => select(null)],
      ['no pack', () => select([])]
    ])("are a list's with %s selected", async (_case, choose) => {
      choose()
      const screen = await renderLoadoutWithTheme()

      expect(badge().icon).toBe('format-list-checks')
      expect(StyleSheet.flatten(badge().style).backgroundColor).toBe(screen.theme.colors.tertiary)
      expect(cardFill(screen)).toBe(screen.theme.colors.tertiaryContainer)
    })
  })

  describe('reset', () => {
    const reset = (screen: Screen) => screen.getByLabelText('Reset settings')

    it('is off while the art, difficulty and packs are all at their defaults', async () => {
      const screen = await renderLoadout()

      expect(reset(screen).props.accessibilityState?.disabled).toBe(true)
    })

    it.each([
      ['an art picked', () => store.dispatch(playerSettingsActions.setMode({ playerKey: GUEST_PLAYER_KEY, modeId: robotMode.id }))],
      ['a difficulty picked', () => store.dispatch(playerSettingsActions.setDifficulty({ playerKey: GUEST_PLAYER_KEY, difficulty: 'easy' }))],
      ['a pack left out', () => store.dispatch(playerSettingsActions.setPackKeys({ playerKey: GUEST_PLAYER_KEY, packKeys: MANIFEST.slice(1).map((item) => item.key) }))]
    ])('turns on with %s', async (_change, change) => {
      change()
      const screen = await renderLoadout()

      expect(reset(screen).props.accessibilityState?.disabled).toBe(false)
    })

    it('asks first, and Cancel changes nothing', async () => {
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: GUEST_PLAYER_KEY, difficulty: 'hard' }))
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: GUEST_PLAYER_KEY, packKeys: [PACK_A.key] }))
      const before = store.getState().playerSettings[GUEST_PLAYER_KEY]
      const screen = await renderLoadout()

      await fireEvent.press(reset(screen))
      expect(screen.getByText('Reset Settings?')).toBeTruthy()
      await fireEvent.press(screen.getByText('Cancel'))

      expect(screen.queryByText('Reset Settings?')).toBeNull()
      expect(store.getState().playerSettings[GUEST_PLAYER_KEY]).toEqual(before)
    })

    it('puts back the default art, Any and every pack once confirmed, redrawing the round waiting', async () => {
      seedSoloRound(['D'])
      store.dispatch(playerSettingsActions.setMode({ playerKey: GUEST_PLAYER_KEY, modeId: 'letters' }))
      store.dispatch(roundActions.setRoundArt({ playerKey: GUEST_PLAYER_KEY, modeId: 'letters' }))
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: GUEST_PLAYER_KEY, difficulty: 'hard' }))
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: GUEST_PLAYER_KEY, packKeys: [PACK_A.key] }))
      const screen = await renderLoadout()
      expect(screen.getByText(`1 of ${N} packs`)).toBeTruthy()

      await fireEvent.press(reset(screen))
      expect(screen.getByText(`The art goes back to ${DEFAULT_MODE.label}, the difficulty to Any, and every pack is selected again.`)).toBeTruthy()
      await fireEvent.press(screen.getByText('Reset'))

      // Every pack is stored as every pack (null), so new ones join it.
      expect(store.getState().playerSettings[GUEST_PLAYER_KEY]).toEqual({ modeId: DEFAULT_MODE.id, difficulty: 'any', packKeys: null })
      // The art is picked the way any art is, so the round waiting follows, guesses and all.
      expect(soloRound().puzzle?.modeId).toBe(DEFAULT_MODE.id)
      expect(soloRound().guessedLetters).toEqual(['D'])
      expect(screen.queryByText('Reset Settings?')).toBeNull()
      expect(screen.getByLabelText('ANY')).toBeTruthy()
      expect(screen.getByText(`All ${N} packs`)).toBeTruthy()
      expect(reset(screen).props.accessibilityState?.disabled).toBe(true)
    })
  })

  // Pack Progress folded in (2026-10-18): every pack's progress is Choose Packs', and its pack browser
  // plays a pack or narrows the selection to it.
  describe('Choose Packs', () => {
    it("lists every pack's unlock progress, marking a complete pack with a trophy", async () => {
      const getItem = storeUnlocks({ [GUEST_PLAYER_KEY]: { [PACK_A.key]: everyPuzzleOf(PACK_A.key) } })
      const screen = await renderLoadout()

      await fireEvent.press(packsCard(screen))

      expect(await choosePacks(screen).findByText(`${commaString(PACK_A.count)} of ${commaString(PACK_A.count)} unlocked`)).toBeTruthy()
      expect(choosePacks(screen).getAllByText(`0 of ${commaString(PACK_B.count)} unlocked`).length).toBeGreaterThan(0)
      expect(choosePacks(screen).getAllByLabelText('Complete')).toHaveLength(1)
      getItem.mockRestore()
    })

    it("opens a pack's puzzles from its info button, starts the puzzle picked from it, and closes Choose Packs on the way to the game", async () => {
      const screen = await renderLoadout()
      const puzzleFromA = getPuzzlesForCategory(PACK_A.key)[0]

      await openPackBrowser(screen, PACK_A.label)
      expect(packBrowser(screen).getByRole('header', { name: PACK_A.label })).toBeTruthy()
      // Browsing is not a draw.
      expect(soloRound().puzzle).toBeNull()
      await fireEvent.press(packBrowser(screen).getByTestId(`puzzle-row-${puzzleFromA.id}`))

      expect(soloRound().puzzle).toMatchObject({ packKey: PACK_A.key, puzzleId: puzzleFromA.id, modeId: DEFAULT_MODE.id })
      expect(mockRouter.push).toHaveBeenCalledWith(GAME_HREF)
      // Nothing is left stacked over the page for the way back.
      expect(panelHidden(screen, 'pack-puzzles-panel')).toBe(true)
      expect(panelHidden(screen, 'packs-screen-panel')).toBe(true)
    })

    it('draws from just that pack from its Play This Pack, leaving the selection alone', async () => {
      const screen = await renderLoadout()

      await openPackBrowser(screen, PACK_A.label)
      await fireEvent.press(packBrowser(screen).getByText('Play This Pack'))

      expect(mockResolvePuzzle.mock.calls[0][1]).toEqual([PACK_A.key])
      // One pack, so the game's Next keeps to it.
      expect(soloRound().puzzle).toMatchObject({ packKey: PACK_A.key, packScope: 'single' })
      expect(mockRouter.push).toHaveBeenCalledWith(GAME_HREF)
      expect(panelHidden(screen, 'packs-screen-panel')).toBe(true)
      expect(store.getState().playerSettings[GUEST_PLAYER_KEY]).toBeUndefined()
    })

    it('narrows the selection to that pack from its Only This Pack, back on Choose Packs, starting nothing', async () => {
      const screen = await renderLoadout()

      await openPackBrowser(screen, PACK_B.label)
      await fireEvent.press(packBrowser(screen).getByText('Only This Pack'))

      expect(store.getState().playerSettings[GUEST_PLAYER_KEY]?.packKeys).toEqual([PACK_B.key])
      expect(panelHidden(screen, 'pack-puzzles-panel')).toBe(true)
      expect(panelHidden(screen, 'packs-screen-panel')).toBe(false)
      expect(choosePacks(screen).getByText(`Done (1 of ${N})`)).toBeTruthy()
      expect(soloRound().puzzle).toBeNull()
      expect(mockRouter.push).not.toHaveBeenCalled()

      // Already just this pack, so there's nothing left for it to do.
      await fireEvent.press(choosePacks(screen).getByLabelText(`View ${PACK_B.label} contents`))
      expect(packBrowser(screen).getByRole('button', { name: 'Only This Pack' }).props.accessibilityState?.disabled).toBe(true)

      // The page names it, and Ready draws from just it.
      await fireEvent.press(packBrowser(screen).getByLabelText('Close'))
      await fireEvent.press(choosePacks(screen).getByLabelText('Close'))
      expect(screen.getByText(`1 of ${N} packs`)).toBeTruthy()
      expect(screen.getByText(PACK_B.label)).toBeTruthy()
      await fireEvent.press(ready(screen))
      expect(mockResolvePuzzle.mock.calls[0][1]).toEqual([PACK_B.key])
    })

    it.each([
      ['a puzzle picked', (screen: Screen) => packBrowser(screen).getByTestId(`puzzle-row-${getPuzzlesForCategory(PACK_A.key)[0].id}`)],
      ['Play This Pack', (screen: Screen) => packBrowser(screen).getByText('Play This Pack')]
    ])('asks before %s abandons a round with a guess on it, over the page', async (_start, findStart) => {
      const before = seedSoloRound(['Q'])
      const screen = await renderLoadout()

      await openPackBrowser(screen, PACK_A.label)
      await fireEvent.press(findStart(screen))
      expect(screen.getByText('Abandon This Puzzle?')).toBeTruthy()
      expect(panelHidden(screen, 'packs-screen-panel')).toBe(true)
      await fireEvent.press(screen.getByText('Cancel'))

      expect(soloRound()).toEqual(before)
      expect(stats().solo.losses).toBe(0)
      expect(mockRouter.push).not.toHaveBeenCalled()
    })

    it("records the abandoned round's loss once confirmed, then starts the pick", async () => {
      // DOG: D right, Q and X wrong.
      const before = seedSoloRound(['D', 'Q', 'X'])
      const screen = await renderLoadout()

      await openPackBrowser(screen, PACK_A.label)
      await fireEvent.press(packBrowser(screen).getByText('Play This Pack'))
      await fireEvent.press(screen.getByText('Abandon'))

      expect(stats().solo).toMatchObject({ played: 1, losses: 1, wins: 0 })
      expect(stats()).toMatchObject({ lettersGuessed: 3, lettersCorrect: 1 })
      expect(soloRound().id).toBe(before.id + 1)
      expect(soloRound()).toMatchObject({ guessedLetters: [], puzzle: { packKey: PACK_A.key, packScope: 'single' } })
      expect(mockRouter.push).toHaveBeenCalledWith(GAME_HREF)
    })
  })

  // The art moved to the Settings sheet (2026-10-17).
  describe('player and art', () => {
    it('has the player picker, on the guest, and no Colors row, Art row or art drawer of its own', async () => {
      const screen = await renderLoadout()

      expect(screen.getByLabelText('GUEST')).toBeTruthy()
      expect(screen.queryByText('Colors')).toBeNull()
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

  // Who plays, and their colors, as one control (PlayerPicker): Guest, every profile, Manage, and the
  // Color row's page of swatches.
  describe('the player picker', () => {
    let measure: jest.SpyInstance
    beforeEach(() => {
      store.dispatch(profilesActions.setAll([ALICE, BOB]))
      measure = answerMeasureInWindow()
    })
    afterEach(() => measure.mockRestore())

    const open = (screen: Screen, trigger = 'GUEST') => fireEvent.press(screen.getByLabelText(trigger))
    const live = () => store.getState().theme

    it('lists the guest and every profile by name, then Manage', async () => {
      const screen = await renderLoadout()

      await open(screen)

      expect(screen.getByText('Guest')).toBeTruthy()
      expect(screen.getByText('Alice')).toBeTruthy()
      expect(screen.getByText('Bob')).toBeTruthy()
      expect(screen.getByText('Manage')).toBeTruthy()
    })

    it('makes the picked profile the active player, and the whole page follows them', async () => {
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: ALICE.id, difficulty: 'hard' }))
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: ALICE.id, packKeys: [PACK_B.key] }))
      seedSoloRound(['Q'])
      const screen = await renderLoadout()
      expect(ready(screen).props.accessibilityHint).toBe('Continues your puzzle')

      await open(screen)
      await fireEvent.press(screen.getByText('Alice'))

      expect(store.getState().activePlayer.profileId).toBe(ALICE.id)
      expect(screen.getByLabelText('ALICE')).toBeTruthy()
      expect(screen.queryByText('Manage')).toBeNull()
      expect(screen.getByLabelText('HARD')).toBeTruthy()
      expect(screen.getByText(`1 of ${N} packs`)).toBeTruthy()
      // The guest's waiting round isn't theirs.
      expect(ready(screen).props.accessibilityHint).toBe('Starts a new puzzle')
      // Their own colors: the profile's color, with nothing picked in Hangman yet.
      expect(live()).toMatchObject({ color: ALICE.color, harmony: DEFAULT_HARMONY })

      await open(screen, 'ALICE')
      await fireEvent.press(screen.getByText('Guest'))

      expect(store.getState().activePlayer.profileId).toBeNull()
      expect(screen.getByLabelText('ANY')).toBeTruthy()
      expect(ready(screen).props.accessibilityHint).toBe('Continues your puzzle')
    })

    it('opens the Profiles screen from Manage, closing the popover', async () => {
      const screen = await renderLoadout()

      await open(screen)
      await fireEvent.press(screen.getByText('Manage'))

      expect(mockRouter.push).toHaveBeenCalledWith('/profiles')
      expect(screen.queryByText('Manage')).toBeNull()
    })

    it("sets the active player's color from its Color page, filed as theirs, with no caption for the guest", async () => {
      const screen = await renderLoadout()

      await open(screen)
      await fireEvent.press(screen.getByLabelText('Color'))
      await fireEvent.press(screen.getByLabelText('Teal'))

      expect(live().color).toBe('#009688')
      expect(store.getState().playerTheme[GUEST_PLAYER_KEY]).toMatchObject({ color: '#009688' })
    })

    it("captions a profile's Color row Hangman only, and files their pick against the profile's own color", async () => {
      store.dispatch(activePlayerActions.setActivePlayer(ALICE.id))
      const screen = await renderLoadout()

      await open(screen, 'ALICE')
      await fireEvent.press(screen.getByLabelText('Color, Hangman only'))
      await fireEvent.press(screen.getByLabelText('Teal'))

      expect(live().color).toBe('#009688')
      expect(store.getState().playerTheme[ALICE.id]).toEqual({ color: '#009688', harmony: DEFAULT_HARMONY, profileColor: ALICE.color })
      // The profile itself keeps its color, for every other game.
      expect(store.getState().profiles.find((profile) => profile.id === ALICE.id)?.color).toBe(ALICE.color)
    })

    it('closes on a press away, and from the Settings cog', async () => {
      const screen = await renderLoadout()

      await open(screen)
      await fireEvent.press(screen.getByLabelText('Dismiss'))
      expect(screen.queryByText('Manage')).toBeNull()

      await open(screen)
      await fireEvent.press(screen.getByLabelText('Settings'))
      expect(screen.queryByText('Manage')).toBeNull()
      expect(screen.getByText('KEYBOARD')).toBeTruthy()
    })

    // Opening one closes the other: they share the page's popover host.
    it("closes when Difficulty's popover opens", async () => {
      const screen = await renderLoadout()

      await open(screen)
      await fireEvent.press(screen.getByLabelText('ANY'))

      expect(screen.queryByText('Manage')).toBeNull()
      expect(screen.getByText('Medium')).toBeTruthy()
    })

    // Each PaletteSwatch is a primary circle with the secondary and tertiary drawn over it.
    it("draws every swatch on its Color page as the whole palette, in the active player's harmony", async () => {
      store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: GUEST_PLAYER_KEY, theme: { color: '#f44336', harmony: 'triadic' } }))
      const screen = await renderLoadout()

      await open(screen)
      await fireEvent.press(screen.getByLabelText('Color'))

      const fills = svgFills(screen.toJSON())
      for (const { value } of defaultColors) expect(fills.Circle).toContain(value)
      // Teal's triad, the way the board would draw it for this player.
      const { secondary, tertiary } = getTriadicPalette('#009688', 'triadic')
      expect(fills.Path).toEqual(expect.arrayContaining([secondary, tertiary]))
    })
  })

  // Everything on the page belongs to the active player (2026-10-17): their picks, their unlocked
  // puzzles and their waiting round.
  describe("the active player's own", () => {
    const OTHER = ALICE.id
    const setActivePlayer = (profileId: string | null) =>
      act(async () => {
        store.dispatch(activePlayerActions.setActivePlayer(profileId))
      })
    beforeEach(() => {
      store.dispatch(profilesActions.setAll([ALICE]))
    })

    it('picks, switched with the player', async () => {
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: OTHER, difficulty: 'hard' }))
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: OTHER, packKeys: [PACK_B.key] }))
      const screen = await renderLoadout()
      expect(screen.getByLabelText('ANY')).toBeTruthy()
      expect(screen.getByText(`All ${N} packs`)).toBeTruthy()

      await setActivePlayer(OTHER)

      expect(screen.getByLabelText('HARD')).toBeTruthy()
      expect(screen.getByText(`1 of ${N} packs`)).toBeTruthy()
      expect(screen.getByText(PACK_B.label)).toBeTruthy()
    })

    it("waiting round: Ready picks up only the player's own, and a new draw asks about nobody else's", async () => {
      seedSoloRound(['Q'])
      const screen = await renderLoadout()

      await setActivePlayer(OTHER)
      expect(ready(screen).props.accessibilityHint).toBe('Starts a new puzzle')
      await fireEvent.press(ready(screen))

      expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
      expect(soloRound(OTHER).puzzle).not.toBeNull()
      expect(soloRound().guessedLetters).toEqual(['Q'])
    })

    it("unlocked puzzles, in Choose Packs' progress", async () => {
      const getItem = storeUnlocks({ [OTHER]: { [PACK_A.key]: everyPuzzleOf(PACK_A.key) } })
      const screen = await renderLoadout()
      await fireEvent.press(packsCard(screen))
      expect(await choosePacks(screen).findAllByText(`0 of ${commaString(PACK_A.count)} unlocked`)).toBeTruthy()
      expect(choosePacks(screen).queryByLabelText('Complete')).toBeNull()

      await setActivePlayer(OTHER)

      expect(await choosePacks(screen).findByText(`${commaString(PACK_A.count)} of ${commaString(PACK_A.count)} unlocked`)).toBeTruthy()
      expect(choosePacks(screen).getAllByLabelText('Complete')).toHaveLength(1)
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

    it('reset, which leaves every other player as they were', async () => {
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: GUEST_PLAYER_KEY, difficulty: 'hard' }))
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: OTHER, difficulty: 'easy' }))
      store.dispatch(activePlayerActions.setActivePlayer(OTHER))
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByLabelText('Reset settings'))
      await fireEvent.press(screen.getByText('Reset'))

      expect(store.getState().playerSettings[OTHER]?.difficulty).toBe('any')
      expect(store.getState().playerSettings[GUEST_PLAYER_KEY]?.difficulty).toBe('hard')
    })
  })

  describe('header and Android back', () => {
    // Like the other games' loadouts (Jay, 2026-10-18): no title, and Home in the corner, as on the
    // game screen, rather than a back arrow.
    it('has no title', async () => {
      const screen = await renderLoadout()

      expect(screen.queryByText('Single Player')).toBeNull()
      expect(screen.queryByLabelText('Back')).toBeNull()
    })

    it('goes Home from the Home corner', async () => {
      const screen = await renderLoadout()

      await fireEvent.press(screen.getByLabelText('Home'))

      expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1)
      expect(mockRouter.dismissTo).toHaveBeenCalledWith('/')
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

      it('closes Choose Packs first, then goes back', async () => {
        const screen = await renderLoadout()

        await fireEvent.press(packsCard(screen))
        expect(panelHidden(screen, 'packs-screen-panel')).toBe(false)

        expect(await pressAndroidBack()).toBe(true)
        expect(panelHidden(screen, 'packs-screen-panel')).toBe(true)
        expect(mockRouter.replace).not.toHaveBeenCalled()

        expect(await pressAndroidBack()).toBe(true)
        // The router mock's canGoBack is false, so safeBack replaces with Home.
        expect(mockRouter.replace).toHaveBeenCalledWith('/')
      })

      // Not the page's to close: each adds its own listener as it opens, after the page's, so it runs
      // first.
      it.each([
        ['the Settings sheet', (screen: Screen) => fireEvent.press(screen.getByLabelText('Settings')), (screen: Screen) => screen.queryByTestId('dialog')],
        [
          'the reset confirm',
          async (screen: Screen) => {
            await act(async () => {
              store.dispatch(playerSettingsActions.setDifficulty({ playerKey: GUEST_PLAYER_KEY, difficulty: 'hard' }))
            })
            await fireEvent.press(screen.getByLabelText('Reset settings'))
          },
          (screen: Screen) => screen.queryByText('Reset Settings?')
        ]
      ])('closes %s first, then goes back', async (_dialog, open, find) => {
        const screen = await renderLoadout()

        await open(screen)
        expect(find(screen)).toBeTruthy()

        expect(await pressAndroidBack()).toBe(true)
        expect(mockRouter.replace).not.toHaveBeenCalled()
        await waitFor(() => expect(find(screen)).toBeNull())

        expect(await pressAndroidBack()).toBe(true)
        expect(mockRouter.replace).toHaveBeenCalledWith('/')
      })

      // The reset itself didn't happen: back is Cancel.
      it('leaves the settings alone when back cancels the reset confirm', async () => {
        store.dispatch(playerSettingsActions.setDifficulty({ playerKey: GUEST_PLAYER_KEY, difficulty: 'hard' }))
        const screen = await renderLoadout()

        await fireEvent.press(screen.getByLabelText('Reset settings'))
        await pressAndroidBack()

        expect(store.getState().playerSettings[GUEST_PLAYER_KEY]?.difficulty).toBe('hard')
      })

      // The page's own, through its one listener: an open picker's popover closes before anything else.
      it.each([
        ['the player picker', 'GUEST', 'Manage'],
        ['Difficulty', 'ANY', 'Medium']
      ])("closes %s's popover first, then goes back", async (_picker, trigger, row) => {
        store.dispatch(profilesActions.setAll([ALICE]))
        const measure = answerMeasureInWindow()
        const screen = await renderLoadout()

        await fireEvent.press(screen.getByLabelText(trigger))
        expect(screen.getByText(row)).toBeTruthy()

        expect(await pressAndroidBack()).toBe(true)
        expect(screen.queryByText(row)).toBeNull()
        expect(mockRouter.replace).not.toHaveBeenCalled()
        expect(backListeners).toHaveLength(1)

        expect(await pressAndroidBack()).toBe(true)
        expect(mockRouter.replace).toHaveBeenCalledWith('/')
        measure.mockRestore()
      })

      // A start from the pack browser opens the confirm and closes the browser and Choose Packs in one
      // commit. The shell's listener is added once per focus, before the confirm's, so the confirm's
      // runs first.
      it.each([
        ['a puzzle picked', (screen: Screen) => packBrowser(screen).getByTestId(`puzzle-row-${getPuzzlesForCategory(PACK_A.key)[0].id}`)],
        ['Play This Pack', (screen: Screen) => packBrowser(screen).getByText('Play This Pack')]
      ])('cancels the abandon confirm opened by %s in the pack browser, and stays on the page', async (_start, findStart) => {
        const before = seedSoloRound(['Q'])
        const screen = await renderLoadout()

        await openPackBrowser(screen, PACK_A.label)
        await fireEvent.press(findStart(screen))
        expect(screen.getByText('Abandon This Puzzle?')).toBeTruthy()
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

        await fireEvent.press(packsCard(screen))
        await fireEvent.press(choosePacks(screen).getByText('Create'))
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

        await openPackBrowser(screen, PACK_A.label)
        expect(panelHidden(screen, 'pack-puzzles-panel')).toBe(false)

        expect(await pressAndroidBack()).toBe(true)
        expect(panelHidden(screen, 'pack-puzzles-panel')).toBe(true)
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

        await openPackBrowser(screen, PACK_A.label)
        await pressAndroidBack()
        await fireEvent.press(choosePacks(screen).getByText('Create'))
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
        await fireEvent.press(packsCard(screen))
        await fireEvent.press(choosePacks(screen).getByText('Create'))

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
        it('closes Choose Packs, drops its listener, and adds it back on focus', async () => {
          const screen = await renderLoadout()
          await fireEvent.press(packsCard(screen))
          expect(panelHidden(screen, 'packs-screen-panel')).toBe(false)

          await setFocused(screen, false)

          expect(panelHidden(screen, 'packs-screen-panel')).toBe(true)
          expect(backListeners).toEqual([])

          await setFocused(screen, true)

          expect(panelHidden(screen, 'packs-screen-panel')).toBe(true)
          expect(backListeners).toHaveLength(1)
          // Nothing open any more, so back goes straight back.
          expect(await pressAndroidBack()).toBe(true)
          expect(mockRouter.replace).toHaveBeenCalledWith('/')
        })

        it.each([
          ['the player picker', 'GUEST', 'Manage'],
          ['Difficulty', 'ANY', 'Medium']
        ])("closes %s's popover, so coming back finds the page itself", async (_picker, trigger, row) => {
          store.dispatch(profilesActions.setAll([ALICE]))
          const measure = answerMeasureInWindow()
          const screen = await renderLoadout()
          await fireEvent.press(screen.getByLabelText(trigger))
          expect(screen.getByText(row)).toBeTruthy()

          await setFocused(screen, false)
          await setFocused(screen, true)

          expect(screen.queryByText(row)).toBeNull()
          measure.mockRestore()
        })

        // Choose Packs closes its own editor and pack browser whenever it closes.
        it("closes Choose Packs' own editor too, so it isn't left open over the page with nothing under it for back to close", async () => {
          const screen = await renderLoadout()
          await fireEvent.press(packsCard(screen))
          await fireEvent.press(choosePacks(screen).getByText('Create'))

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

  // The board is in the active player's colors, picked on the Single Player loadout.
  it('has no Colors row, Art row or art drawer of its own', async () => {
    const screen = await renderPnpLoadout()

    expect(screen.queryByText('Colors')).toBeNull()
    expect(screen.queryByLabelText('GUEST')).toBeNull()
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
