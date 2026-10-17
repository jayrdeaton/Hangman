import { Provider } from '@rific/auto-paper'
import { FeedbackPressProvider } from '@rific/feedback-press'
import { act, fireEvent, render as rtlRender, waitFor } from '@testing-library/react-native'
import { type ReactElement, type ReactNode, useEffect } from 'react'
import { BackHandler, StyleSheet } from 'react-native'
import * as RNPaper from 'react-native-paper'
import { Provider as ReduxProvider } from 'react-redux'

import { StatsScreen, type StatsScreenProps } from '@/components/StatsScreen'
import { ACHIEVEMENT_CATALOG, VISIBLE_MODE_COUNT } from '@/constants/achievements'
import { type CatalogActions, CatalogProvider, useCatalogActions } from '@/hooks/useCatalog'
import { GameStatsProvider } from '@/hooks/useGameStats'
import { achievementsActions } from '@/redux/achievementsSlice'
import { store } from '@/redux/store'
import type { StatsState, UnlockedAchievementsState } from '@/types/stats'
import { loadCustomPacksCache, saveCustomPack } from '@/utils/customPacks'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'
import { createDefaultStats } from '@/utils/statsValidation'
import { clearPuzzleUnlocks, getPuzzleUnlockMap, type PuzzleUnlockMap } from '@/utils/unlocks'

// AsyncStorage is a no-op stub in tests, so the unlocked puzzles come from getPuzzleUnlockMap (the
// real one, always empty, unless a test hands it a map) and the reset's puzzle-unlock half is checked
// through clearPuzzleUnlocks.
jest.mock('@/utils/unlocks', () => {
  const actual = jest.requireActual('@/utils/unlocks')
  return { ...actual, getPuzzleUnlockMap: jest.fn(actual.getPuzzleUnlockMap), clearPuzzleUnlocks: jest.fn().mockResolvedValue(undefined) }
})
const mockGetPuzzleUnlockMap = jest.mocked(getPuzzleUnlockMap)
const mockClearPuzzleUnlocks = jest.mocked(clearPuzzleUnlocks)
const realGetPuzzleUnlockMap: typeof getPuzzleUnlockMap = jest.requireActual('@/utils/unlocks').getPuzzleUnlockMap

// What every other screen sharing the catalog counters can do while this one is open: a win, a
// backup import, a pack saved.
let catalog: CatalogActions | null = null
const CatalogProbe = () => {
  const actions = useCatalogActions()
  useEffect(() => {
    catalog = actions
  }, [actions])
  return null
}

// The app's nesting (see Providers.tsx): the stats store and GameStatsProvider (the screen reads one
// and resets through the other), the catalog counters it re-reads its packs and unlocks on, then
// FeedbackPressProvider outside auto-paper's Provider, whose Portal.Host the reset confirm renders
// into.
const Wrapper = ({ children }: { children: ReactNode }) => (
  <ReduxProvider store={store}>
    <GameStatsProvider>
      <CatalogProvider>
        <CatalogProbe />
        <FeedbackPressProvider paper={RNPaper}>
          <Provider initialValue={{ appearance: 'light' }}>{children}</Provider>
        </FeedbackPressProvider>
      </CatalogProvider>
    </GameStatsProvider>
  </ReduxProvider>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Wrapper })

const insets = { top: 0, left: 0, bottom: 0, right: 0 }
// The packs the screen counts: the catalog's own manifest, as the loadout's rows read it.
const MANIFEST = getPuzzleManifest().filter((item) => item.count > 0)
const TOTAL = MANIFEST.reduce((sum, item) => sum + item.count, 0)
const renderScreen = (props: Partial<StatsScreenProps> = {}) => render(<StatsScreen onBack={jest.fn()} insets={insets} {...props} />)
const seedStats = (patch: Partial<StatsState>, unlocked: UnlockedAchievementsState = {}) => store.dispatch(achievementsActions.update({ stats: { ...createDefaultStats(), ...patch }, unlocked }))
const storeUnlocks = (map: PuzzleUnlockMap) => mockGetPuzzleUnlockMap.mockResolvedValue(map)

type Screen = Awaited<ReturnType<typeof renderScreen>>
// A StatRow is its label then its value, side by side in one row.
const rowValue = (screen: Screen, label: string): unknown => (screen.getByText(label).parent!.children[1] as unknown as { props: { children: unknown } }).props.children
const n = (value: number) => value.toLocaleString('en-US')

describe('StatsScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    mockGetPuzzleUnlockMap.mockImplementation(realGetPuzzleUnlockMap)
    store.dispatch(achievementsActions.reset())
    // Back to the stub storage's empty custom-pack list, in case a test saved one.
    await loadCustomPacksCache()
    catalog = null
  })

  it("is the fleet's stats screen, titled Stats & Achievements, with Progress, Solo, Pass & Play, Activity and every achievement", async () => {
    const screen = await renderScreen()

    expect(screen.getByText('Stats & Achievements')).toBeTruthy()
    for (const label of ['PROGRESS', 'SOLO', 'PASS & PLAY', 'ACTIVITY', 'ALL ACHIEVEMENTS']) expect(screen.getByText(label)).toBeTruthy()
    for (const achievement of ACHIEVEMENT_CATALOG) expect(screen.getAllByText(achievement.title).length).toBeGreaterThan(0)
  })

  it('shows every stat from the store', async () => {
    seedStats({
      solo: { played: 15, wins: 12, losses: 3, draws: 0 },
      soloStreak: { currentWinStreak: 2, bestWinStreak: 7 },
      flawlessWins: 4,
      noHintWins: 6,
      wonModeIds: ['classic', 'candle', 'flower'],
      lettersGuessed: 1500,
      lettersCorrect: 900,
      customPacksCreated: 2,
      pnp: { played: 5, wins: 4, losses: 1, draws: 0 },
      distinctDaysPlayed: 9,
      currentDayStreak: 3,
      bestDayStreak: 5
    })
    const screen = await renderScreen()
    const expected: [string, string][] = [
      ['Played', '15'],
      ['Won', '12'],
      ['Lost', '3'],
      ['Win Rate', '80%'],
      ['Current Streak', '2'],
      ['Best Streak', '7'],
      ['Flawless Wins', '4'],
      ['Wins Without a Hint', '6'],
      ['Modes Won', `3 / ${VISIBLE_MODE_COUNT}`],
      ['Letters Guessed', '1,500'],
      ['Letters Correct', '900'],
      ['Custom Packs Created', '2'],
      ['Rounds Played', '5'],
      ['Words Solved', '4'],
      ['Words Missed', '1'],
      ['Solve Rate', '80%'],
      ['Days Played', '9'],
      ['Day Streak', '3'],
      ['Best Day Streak', '5']
    ]

    expect(expected.map(([label]) => [label, rowValue(screen, label)])).toEqual(expected)
  })

  it('shows a "-" rate, not 0%, before anything is played', async () => {
    const screen = await renderScreen()

    expect(rowValue(screen, 'Win Rate')).toBe('-')
    expect(rowValue(screen, 'Solve Rate')).toBe('-')
  })

  it('counts puzzles unlocked and packs completed over the catalog and the stored unlock map, and achievements earned from the store', async () => {
    const [full, partial] = MANIFEST
    seedStats({}, { first_game_played: 1, first_ever_win: 2, retired_achievement: 3 })
    storeUnlocks({ [full.key]: getPuzzlesForCategory(full.key).map((puzzle) => puzzle.id), [partial.key]: ['some-puzzle'] })
    const screen = await renderScreen()

    // The unlock map loads a moment after mount.
    await waitFor(() => expect(rowValue(screen, 'Puzzles Unlocked')).toBe(`${n(full.count + 1)} / ${n(TOTAL)}`))
    expect(rowValue(screen, 'Packs Completed')).toBe(`1 / ${MANIFEST.length}`)
    // An id no longer in the catalog doesn't count.
    expect(rowValue(screen, 'Achievements Earned')).toBe(`2 / ${ACHIEVEMENT_CATALOG.length}`)
  })

  // The counters are app-wide (a .hangman backup opened from another app imports over whatever screen
  // is showing), so the rows follow them while this page is open.
  it('reads the unlock map again whenever the unlocks change elsewhere', async () => {
    const [pack] = MANIFEST
    const screen = await renderScreen()
    await waitFor(() => expect(mockGetPuzzleUnlockMap).toHaveBeenCalledTimes(1))
    expect(rowValue(screen, 'Puzzles Unlocked')).toBe(`0 / ${n(TOTAL)}`)

    storeUnlocks({ [pack.key]: ['one', 'two'] })
    await act(async () => catalog!.refreshUnlocks())

    await waitFor(() => expect(rowValue(screen, 'Puzzles Unlocked')).toBe(`2 / ${n(TOTAL)}`))
    expect(mockGetPuzzleUnlockMap).toHaveBeenCalledTimes(2)
  })

  it('counts a custom pack once the custom packs change, completed when every word in it is won', async () => {
    storeUnlocks({ 'custom:test': ['a', 'b', 'c'] })
    const screen = await renderScreen()
    await waitFor(() => expect(mockGetPuzzleUnlockMap).toHaveBeenCalledTimes(1))
    // Its unlocks don't count while the pack itself isn't in the catalog.
    expect(rowValue(screen, 'Puzzles Unlocked')).toBe(`0 / ${n(TOTAL)}`)

    await act(async () => {
      await saveCustomPack({ key: 'custom:test', label: 'My Words', entries: [{ answer: 'CAT' }, { answer: 'DOG' }, { answer: 'BIRD' }] })
      catalog!.refreshCustomPacks()
    })

    await waitFor(() => expect(rowValue(screen, 'Packs Completed')).toBe(`1 / ${MANIFEST.length + 1}`))
    expect(rowValue(screen, 'Puzzles Unlocked')).toBe(`3 / ${n(TOTAL + 3)}`)
  })

  it('shows when an earned achievement was unlocked', async () => {
    seedStats({ flawlessWins: 1 }, { flawless_bronze: Date.now() })
    const screen = await renderScreen()

    expect(screen.getAllByText('Unlocked today')).toHaveLength(1)
  })

  it('goes back from the header arrow and from the accessibility escape gesture', async () => {
    const onBack = jest.fn()
    const screen = await renderScreen({ onBack })

    await fireEvent.press(screen.getByLabelText('Back'))
    expect(onBack).toHaveBeenCalledTimes(1)

    await fireEvent(screen.getByTestId('stats-screen'), 'accessibilityEscape')
    expect(onBack).toHaveBeenCalledTimes(2)
  })

  // A route page now: the stack pops it on Android back, so a listener of its own would take back
  // away from the navigator.
  it('leaves Android back to the navigator', async () => {
    const addEventListener = jest.spyOn(BackHandler, 'addEventListener')
    await renderScreen()

    expect(addEventListener.mock.calls.filter(([event]) => event === 'hardwareBackPress')).toHaveLength(0)
    addEventListener.mockRestore()
  })

  // The route's page under the app's one board (see BoardBackground): no full-screen layer of its own,
  // and nothing between the board and the rows paints over it.
  it('fills its page with no layer or background of its own, so the board shows through', async () => {
    const screen = await renderScreen()
    const root = screen.getByTestId('stats-screen')
    const rootStyle = StyleSheet.flatten(root.props.style)

    expect(rootStyle).toMatchObject({ flex: 1 })
    expect(rootStyle.position).toBeUndefined()
    expect(rootStyle.zIndex).toBeUndefined()
    expect(root.props.accessibilityViewIsModal).toBeFalsy()

    const backgrounds: unknown[] = []
    for (let node = screen.getByText('Stats & Achievements').parent; node && node !== root.parent; node = node.parent) {
      const background = StyleSheet.flatten(node.props.style)?.backgroundColor
      if (background !== undefined) backgrounds.push(background)
    }
    expect(backgrounds.length).toBeGreaterThan(0)
    expect(backgrounds.every((background) => background === 'transparent')).toBe(true)
  })

  it('keeps everything when the reset confirm is canceled', async () => {
    seedStats({ solo: { played: 2, wins: 2, losses: 0, draws: 0 } })
    const screen = await renderScreen()
    await waitFor(() => expect(mockGetPuzzleUnlockMap).toHaveBeenCalledTimes(1))

    await fireEvent.press(screen.getByText('Reset All Stats'))
    expect(screen.getByText('Reset Everything?')).toBeTruthy()
    expect(screen.getByText(/every stat, achievement and unlocked puzzle/)).toBeTruthy()
    await fireEvent.press(screen.getByText('Cancel'))

    expect(screen.queryByText('Reset Everything?')).toBeNull()
    expect(mockClearPuzzleUnlocks).not.toHaveBeenCalled()
    expect(store.getState().achievements.stats.solo.wins).toBe(2)
    // No refreshUnlocks, so nothing re-reads the unlocked puzzles.
    expect(mockGetPuzzleUnlockMap).toHaveBeenCalledTimes(1)
  })

  it('clears every stat, achievement and unlocked puzzle once the reset is confirmed, then has every screen re-read the unlocks', async () => {
    const [pack] = MANIFEST
    seedStats({ solo: { played: 2, wins: 2, losses: 0, draws: 0 } }, { first_ever_win: Date.now() })
    storeUnlocks({ [pack.key]: ['one', 'two'] })
    const screen = await renderScreen()
    await waitFor(() => expect(rowValue(screen, 'Puzzles Unlocked')).toBe(`2 / ${n(TOTAL)}`))

    // What the storage holds once clearPuzzleUnlocks has run.
    storeUnlocks({})
    await fireEvent.press(screen.getByText('Reset All Stats'))
    await fireEvent.press(screen.getByText('Reset'))

    // refreshUnlocks bumps unlockVersion, which is what re-reads the map here (and on every other
    // screen counting unlocks).
    await waitFor(() => expect(rowValue(screen, 'Puzzles Unlocked')).toBe(`0 / ${n(TOTAL)}`))
    expect(mockClearPuzzleUnlocks).toHaveBeenCalledTimes(1)
    expect(mockGetPuzzleUnlockMap).toHaveBeenCalledTimes(2)
    // Only after the unlocks are cleared, or the re-read would find them still there.
    expect(mockClearPuzzleUnlocks.mock.invocationCallOrder[0]).toBeLessThan(mockGetPuzzleUnlockMap.mock.invocationCallOrder[1])
    expect(store.getState().achievements).toEqual({ stats: createDefaultStats(), unlocked: {} })
    expect(rowValue(screen, 'Won')).toBe('0')
  })
})
