import { Provider } from '@rific/auto-paper'
import { FeedbackPressProvider } from '@rific/feedback-press'
import { fireEvent, render as rtlRender, waitFor } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { BackHandler } from 'react-native'
import * as RNPaper from 'react-native-paper'
import { Provider as ReduxProvider } from 'react-redux'

import { StatsScreen, type StatsScreenProps } from '@/components/StatsScreen'
import { ACHIEVEMENT_CATALOG, VISIBLE_MODE_COUNT } from '@/constants/achievements'
import { GameStatsProvider } from '@/hooks/useGameStats'
import { achievementsActions } from '@/redux/achievementsSlice'
import { store } from '@/redux/store'
import type { StatsState, UnlockedAchievementsState } from '@/types/stats'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'
import { createDefaultStats } from '@/utils/statsValidation'
import { clearPuzzleUnlocks } from '@/utils/unlocks'

// AsyncStorage is a no-op stub in tests, so the reset's puzzle-unlock half is checked through this.
jest.mock('@/utils/unlocks', () => ({
  ...jest.requireActual('@/utils/unlocks'),
  clearPuzzleUnlocks: jest.fn().mockResolvedValue(undefined)
}))
const mockClearPuzzleUnlocks = jest.mocked(clearPuzzleUnlocks)

// The app's nesting (see Providers.tsx): the stats store and GameStatsProvider (the screen reads one
// and resets through the other), then FeedbackPressProvider outside auto-paper's Provider, whose
// Portal.Host the reset confirm renders into.
const Wrapper = ({ children }: { children: ReactNode }) => (
  <ReduxProvider store={store}>
    <GameStatsProvider>
      <FeedbackPressProvider paper={RNPaper}>
        <Provider initialValue={{ appearance: 'light' }}>{children}</Provider>
      </FeedbackPressProvider>
    </GameStatsProvider>
  </ReduxProvider>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Wrapper })

const insets = { top: 0, left: 0, bottom: 0, right: 0 }
// What the Game Menu passes in: its own manifest.
const MANIFEST = getPuzzleManifest().filter((item) => item.count > 0)
const renderScreen = (props: Partial<StatsScreenProps> = {}) => render(<StatsScreen onBack={jest.fn()} insets={insets} manifest={MANIFEST} unlockMap={{}} onUnlocksChanged={jest.fn()} {...props} />)
const seedStats = (patch: Partial<StatsState>, unlocked: UnlockedAchievementsState = {}) => store.dispatch(achievementsActions.update({ stats: { ...createDefaultStats(), ...patch }, unlocked }))

type Screen = Awaited<ReturnType<typeof renderScreen>>
// A StatRow is its label then its value, side by side in one row.
const rowValue = (screen: Screen, label: string): unknown => (screen.getByText(label).parent!.children[1] as unknown as { props: { children: unknown } }).props.children

describe('StatsScreen', () => {
  beforeEach(() => {
    store.dispatch(achievementsActions.reset())
    mockClearPuzzleUnlocks.mockClear()
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

  it('counts puzzles unlocked and packs completed over the manifest and unlock map it is given, and achievements earned from the store', async () => {
    // A custom pack on the end, as the Game Menu's manifest has once one is saved.
    const manifest = [...MANIFEST, { ...MANIFEST[0], key: 'custom:test', label: 'My Words', count: 3 }]
    const [full, partial] = manifest
    const total = manifest.reduce((sum, item) => sum + item.count, 0)
    seedStats({}, { first_game_played: 1, first_ever_win: 2, retired_achievement: 3 })
    const unlockMap = { [full.key]: getPuzzlesForCategory(full.key).map((puzzle) => puzzle.id), [partial.key]: ['some-puzzle'] }
    const screen = await renderScreen({ manifest, unlockMap })

    expect(rowValue(screen, 'Puzzles Unlocked')).toBe(`${(full.count + 1).toLocaleString('en-US')} / ${total.toLocaleString('en-US')}`)
    expect(rowValue(screen, 'Packs Completed')).toBe(`1 / ${manifest.length}`)
    // An id no longer in the catalog doesn't count.
    expect(rowValue(screen, 'Achievements Earned')).toBe(`2 / ${ACHIEVEMENT_CATALOG.length}`)
  })

  it('shows when an earned achievement was unlocked', async () => {
    seedStats({ flawlessWins: 1 }, { flawless_bronze: Date.now() })
    const screen = await renderScreen()

    expect(screen.getAllByText('Unlocked today')).toHaveLength(1)
  })

  it('goes back from the header arrow and from Android back, and lets go of back once closed', async () => {
    const remove = jest.fn()
    const addEventListener = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove })
    const onBack = jest.fn()
    const screen = await renderScreen({ onBack })

    await fireEvent.press(screen.getByLabelText('Back'))
    expect(onBack).toHaveBeenCalledTimes(1)

    const handler = addEventListener.mock.calls.find(([event]) => event === 'hardwareBackPress')![1] as () => boolean
    expect(handler()).toBe(true)
    expect(onBack).toHaveBeenCalledTimes(2)

    await screen.unmount()
    expect(remove).toHaveBeenCalled()
    addEventListener.mockRestore()
  })

  it('keeps everything when the reset confirm is canceled', async () => {
    seedStats({ solo: { played: 2, wins: 2, losses: 0, draws: 0 } })
    const onUnlocksChanged = jest.fn()
    const screen = await renderScreen({ onUnlocksChanged })

    await fireEvent.press(screen.getByText('Reset All Stats'))
    expect(screen.getByText('Reset Everything?')).toBeTruthy()
    expect(screen.getByText(/every stat, achievement and unlocked puzzle/)).toBeTruthy()
    await fireEvent.press(screen.getByText('Cancel'))

    expect(screen.queryByText('Reset Everything?')).toBeNull()
    expect(mockClearPuzzleUnlocks).not.toHaveBeenCalled()
    expect(store.getState().achievements.stats.solo.wins).toBe(2)
    expect(onUnlocksChanged).not.toHaveBeenCalled()
  })

  it('clears every stat, achievement and unlocked puzzle once the reset is confirmed, then tells the menu', async () => {
    seedStats({ solo: { played: 2, wins: 2, losses: 0, draws: 0 } }, { first_ever_win: Date.now() })
    const onUnlocksChanged = jest.fn()
    const screen = await renderScreen({ onUnlocksChanged })

    await fireEvent.press(screen.getByText('Reset All Stats'))
    await fireEvent.press(screen.getByText('Reset'))

    await waitFor(() => expect(onUnlocksChanged).toHaveBeenCalledTimes(1))
    expect(mockClearPuzzleUnlocks).toHaveBeenCalledTimes(1)
    expect(store.getState().achievements).toEqual({ stats: createDefaultStats(), unlocked: {} })
    expect(rowValue(screen, 'Won')).toBe('0')
  })
})
