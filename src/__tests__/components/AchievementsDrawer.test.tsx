import { FeedbackPressProvider } from '@rific/feedback-press'
import { act, fireEvent, render as rtlRender, waitFor, within } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import * as RNPaper from 'react-native-paper'
import { Provider as ReduxProvider } from 'react-redux'

import { AchievementsDrawer } from '@/components/AchievementsDrawer'
import { GameStatsProvider } from '@/hooks/useGameStats'
import { DEFAULT_MODE } from '@/modes/registry'
import { achievementsActions } from '@/redux/achievementsSlice'
import { store } from '@/redux/store'
import type { StatsState, UnlockedAchievementsState } from '@/types/stats'
import { alert } from '@/utils/alert'
import { pickHangmanFile, shareProgressBackupFile } from '@/utils/hangmanFile'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'
import { resolvePuzzle } from '@/utils/puzzlePicker'
import { createDefaultStats } from '@/utils/statsValidation'
import { clearPuzzleUnlocks, getPuzzleUnlockMap, mergePuzzleUnlocks } from '@/utils/unlocks'

// mergePuzzleUnlocks/clearPuzzleUnlocks read/write AsyncStorage (globally stubbed as a no-op in
// jest.setup.ts) — mocked here instead so the Progress backup tests below can assert on exactly
// what the drawer passed in and control what comes back, independent of that stub's always-empty
// storage. parseProgressBackup is left as the real implementation (spread from requireActual)
// since its own shape-validation logic is exactly what the invalid-backup tests below exercise.
jest.mock('@/utils/unlocks', () => ({
  ...jest.requireActual('@/utils/unlocks'),
  mergePuzzleUnlocks: jest.fn(),
  clearPuzzleUnlocks: jest.fn().mockResolvedValue(undefined),
  // Real getPuzzleUnlockMap reads AsyncStorage, globally stubbed to always return null — mocked
  // here instead so the "Collection Complete" count test below can put a pack at 100% without
  // needing real storage.
  getPuzzleUnlockMap: jest.fn()
}))

// AchievementsDrawer only ever talks to the real device/OS through this module (see hangmanFile.ts
// and PacksScreen.test.tsx's identical boundary for why file pickers/share sheets aren't
// meaningfully unit-testable here).
jest.mock('@/utils/hangmanFile', () => ({
  pickHangmanFile: jest.fn(),
  shareProgressBackupFile: jest.fn()
}))

jest.mock('@/utils/alert', () => ({
  alert: jest.fn().mockResolvedValue(undefined)
}))

// resolvePuzzle (Random's own path) is overridden, mirroring PackPuzzlesDrawer.test.tsx's
// identical setup — every test restores the real implementation in beforeEach so it exercises
// genuine resolution against real pack data unless a specific test needs to force a failure.
jest.mock('@/utils/puzzlePicker', () => ({
  ...jest.requireActual('@/utils/puzzlePicker'),
  resolvePuzzle: jest.fn()
}))

const mockMergePuzzleUnlocks = jest.mocked(mergePuzzleUnlocks)
const mockClearPuzzleUnlocks = jest.mocked(clearPuzzleUnlocks)
const mockGetPuzzleUnlockMap = jest.mocked(getPuzzleUnlockMap)
const mockPickHangmanFile = jest.mocked(pickHangmanFile)
const mockShareProgressBackupFile = jest.mocked(shareProgressBackupFile)
const mockAlert = jest.mocked(alert)
const mockResolvePuzzle = jest.mocked(resolvePuzzle)
const realResolvePuzzle: typeof resolvePuzzle = jest.requireActual('@/utils/puzzlePicker').resolvePuzzle

// ConfirmDialog (like RoundEndDialog in Game.test.tsx) renders through react-native-paper's Portal
// and needs a Portal.Host ancestor, normally supplied by
// @rific/auto-paper's Provider at the app root. FeedbackPressProvider's real `paper` module is
// also injected here (see Haptic.tsx, the app's own root wiring) — without it, @rific/feedback-
// press's Button/IconButton fall back to a bare RN Pressable that drops accessibilityLabel
// entirely, which every backAction/Button query below (Close, Back to achievements, Random,
// Reset all progress, the confirm dialog's own buttons) relies on. FeedbackPressProvider has to
// wrap PaperProvider, not nest inside it — PaperProvider's PortalHost mounts near its own root
// (same reasoning as Providers.tsx hoisting the real app's Haptic above Theme), so nested the
// other way, the confirm dialog's own Portal-rendered buttons would sit outside its context.
// The app's stats store and GameStatsProvider wrap it all too: the drawer reads its stats and
// achievements from the store and resets through useGameStats.
const Wrapper = ({ children }: { children: ReactNode }) => (
  <ReduxProvider store={store}>
    <GameStatsProvider>
      <FeedbackPressProvider paper={RNPaper}>
        <RNPaper.PaperProvider>{children}</RNPaper.PaperProvider>
      </FeedbackPressProvider>
    </GameStatsProvider>
  </ReduxProvider>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Wrapper })

const builtIn = () => getPuzzleManifest().filter((item) => item.count > 0)[0]

const renderDrawer = (overrides: Partial<React.ComponentProps<typeof AchievementsDrawer>> = {}) => render(<AchievementsDrawer visible onDismiss={jest.fn()} unlockVersion={0} onUnlocksChanged={jest.fn()} mode={DEFAULT_MODE} difficulty='any' onConfirm={jest.fn()} {...overrides} />)

// Puts stats (and optionally unlocks) straight into the app's stats store, on top of fresh defaults.
const seedStats = (patch: Partial<StatsState>, unlocked: UnlockedAchievementsState = {}) => store.dispatch(achievementsActions.update({ stats: { ...createDefaultStats(), ...patch }, unlocked }))

describe('AchievementsDrawer', () => {
  beforeEach(() => {
    store.dispatch(achievementsActions.reset())
    mockMergePuzzleUnlocks.mockReset()
    mockClearPuzzleUnlocks.mockClear()
    mockGetPuzzleUnlockMap.mockReset().mockResolvedValue({})
    mockPickHangmanFile.mockReset()
    mockShareProgressBackupFile.mockReset()
    mockAlert.mockClear()
    mockResolvePuzzle.mockReset()
    mockResolvePuzzle.mockImplementation(realResolvePuzzle)
  })

  it('renders as a drawer panel, with the total-progress card, every achievement, and a row per pack', async () => {
    const pack = builtIn()
    const { getAllByText, getByText, getByTestId } = await renderDrawer()

    // "Achievements" appears twice — once as the drawer's own title, once as the section label
    // above the achievement cards.
    expect(getAllByText('Achievements')).toHaveLength(2)
    expect(getByTestId('achievements-drawer-panel')).toBeTruthy()
    expect(getByText('Total Progress')).toBeTruthy()
    expect(getByText('Puzzles unlocked')).toBeTruthy()
    // Rendered regardless of unlock state: locked ones show a grey badge and a lock.
    expect(getByText('No Hints Needed')).toBeTruthy()
    expect(getByText('Stats')).toBeTruthy()
    expect(getByText('Pass & Play')).toBeTruthy()
    expect(getByText('Browse by Pack')).toBeTruthy()
    expect(getByText(pack.label)).toBeTruthy()
  })

  it('calls onDismiss when Close is pressed', async () => {
    const onDismiss = jest.fn()
    const { getByLabelText } = await renderDrawer({ onDismiss })

    await fireEvent.press(getByLabelText('Close'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("shows the pack's puzzle list in place when its row is pressed, and returns to the overview on back", async () => {
    const pack = builtIn()
    const puzzle = getPuzzlesForCategory(pack.key)[0]
    const onDismiss = jest.fn()
    const { getAllByText, getByText, queryByText, queryByTestId, findByTestId, findByText, getByLabelText } = await renderDrawer({ onDismiss })

    // The detail content (the pack's full puzzle list) isn't rendered until its row is pressed.
    expect(queryByTestId(`puzzle-row-${puzzle.id}`)).toBeNull()

    await fireEvent.press(getByText(pack.label))

    // The whole overview (achievements list, "Browse by Pack" section, everything) swaps out for
    // the pack's own puzzle list in place — not a dialog stacked on top of it — and the header now
    // shows the pack's own label instead of "Achievements" (opens on filter='all', masked
    // throughout since the mocked empty unlock map guarantees nothing is solved yet here).
    await waitFor(() => expect(queryByText('Browse by Pack')).toBeNull())
    expect(queryByText('Achievements')).toBeNull()
    expect(await findByText(/unlocked/)).toBeTruthy()
    expect(await findByTestId(`puzzle-row-${puzzle.id}`)).toBeTruthy()

    await fireEvent.press(getByLabelText('Back to achievements'))

    // Back to "Achievements" appearing twice — the drawer's own title and the section label above
    // the achievement cards — same as before the pack row was ever pressed.
    expect(getAllByText('Achievements')).toHaveLength(2)
    expect(getByText('Browse by Pack')).toBeTruthy()
    expect(queryByTestId(`puzzle-row-${puzzle.id}`)).toBeNull()
    // Back is a local step-back, not a dismiss — the whole Achievements drawer must stay open.
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('plays the exact puzzle tapped in the pack detail view, not a random draw, and closes the whole drawer the same way Random does', async () => {
    const pack = builtIn()
    const puzzle = getPuzzlesForCategory(pack.key)[0]
    const onConfirm = jest.fn()
    const onDismiss = jest.fn()
    const { getByText, findByTestId } = await renderDrawer({ onConfirm, onDismiss })

    await fireEvent.press(getByText(pack.label))
    const row = await findByTestId(`puzzle-row-${puzzle.id}`)

    await fireEvent.press(row)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const [payload, config] = onConfirm.mock.calls[0]
    expect(payload.puzzleId).toBe(puzzle.id)
    expect(payload.packKey).toBe(pack.key)
    expect(config.sourceMode).toBe('random')
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("draws a random puzzle from the pack being browsed when Random is pressed, and closes the whole drawer the same way PackPuzzlesDrawer's does", async () => {
    const pack = builtIn()
    const onConfirm = jest.fn()
    const onDismiss = jest.fn()
    const { getByText } = await renderDrawer({ onConfirm, onDismiss })

    await fireEvent.press(getByText(pack.label))
    await waitFor(() => expect(getByText('Random')).toBeTruthy())

    await fireEvent.press(getByText('Random'))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const [payload, config] = onConfirm.mock.calls[0]
    expect(payload.packKey).toBe(pack.key)
    expect(config.sourceMode).toBe('random')
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not close when Random fails to find anything for the pack being browsed (the alert is the only feedback)', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: false, error: 'No puzzles available for the selected packs and difficulty.' })
    const pack = builtIn()
    const onConfirm = jest.fn()
    const onDismiss = jest.fn()
    const { getByText } = await renderDrawer({ onConfirm, onDismiss })

    await fireEvent.press(getByText(pack.label))
    await waitFor(() => expect(getByText('Random')).toBeTruthy())

    await fireEvent.press(getByText('Random'))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
    expect(mockAlert).toHaveBeenCalledWith('No Puzzles Available', 'No puzzles available for the selected packs and difficulty.')
  })

  it("passes Main.tsx's current mode/difficulty through to the Random draw, not pickers of its own", async () => {
    const pack = builtIn()
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: { phrase: 'X', mode: DEFAULT_MODE, sourceMode: 'random', packKey: pack.key, packLabel: pack.label, puzzleId: 'x', difficultyTier: 'hard' } })
    const { getByText } = await renderDrawer({ difficulty: 'hard' })

    await fireEvent.press(getByText(pack.label))
    await waitFor(() => expect(getByText('Random')).toBeTruthy())

    await fireEvent.press(getByText('Random'))

    expect(mockResolvePuzzle).toHaveBeenCalledWith(expect.objectContaining({ difficulty: 'hard', mode: DEFAULT_MODE }), [pack.key], expect.anything())
  })

  it("passes this pack's own freshly-fetched unlock map through to Random, so it can prefer a puzzle the player hasn't unlocked yet", async () => {
    const pack = builtIn()
    mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: ['solved-1'] })
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: { phrase: 'X', mode: DEFAULT_MODE, sourceMode: 'random', packKey: pack.key, packLabel: pack.label, puzzleId: 'x', difficultyTier: 'easy' } })
    const { getByText, findByText } = await renderDrawer()

    await fireEvent.press(getByText(pack.label))
    // Waits for the unlock-map fetch to resolve (PackPuzzleList's own progress header reads the
    // same mocked getPuzzleUnlockMap) before pressing Random, so the assertion below isn't racing
    // against a still-empty {} from before it settled.
    await findByText(`1 of ${pack.count} unlocked`)

    await fireEvent.press(getByText('Random'))

    expect(mockResolvePuzzle).toHaveBeenCalledWith(expect.anything(), [pack.key], { [pack.key]: ['solved-1'] })
  })

  it('shows a different pack correctly after returning from an earlier one', async () => {
    const [firstPack, secondPack] = getPuzzleManifest().filter((item) => item.count > 0)
    const { getByText, queryByText, getByLabelText } = await renderDrawer()

    await fireEvent.press(getByText(firstPack.label))
    await waitFor(() => expect(getByText(firstPack.label)).toBeTruthy())

    await fireEvent.press(getByLabelText('Back to achievements'))
    await fireEvent.press(getByText(secondPack.label))

    // Not just "some pack" reappearing — the SECOND pack's own label and progress, not a stale
    // read of the first one PackPuzzleList was keyed on moments ago.
    await waitFor(() => expect(queryByText('Browse by Pack')).toBeNull())
    expect(getByText(secondPack.label)).toBeTruthy()
    expect(queryByText(firstPack.label)).toBeNull()
  })

  it('routes onAccessibilityEscape to a local step-back while browsing a pack, and to Close from the overview', async () => {
    const pack = builtIn()
    const onDismiss = jest.fn()
    const { getByText, getByTestId, queryByText } = await renderDrawer({ onDismiss })

    await act(async () => {
      getByTestId('achievements-drawer-panel').props.onAccessibilityEscape()
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)

    onDismiss.mockClear()
    await fireEvent.press(getByText(pack.label))
    await waitFor(() => expect(queryByText('Browse by Pack')).toBeNull())

    await act(async () => {
      getByTestId('achievements-drawer-panel').props.onAccessibilityEscape()
    })

    // Escape while browsing a pack must go back one step, exactly like the visible back-arrow —
    // not skip past the overview straight to closing the whole drawer.
    expect(onDismiss).not.toHaveBeenCalled()
    expect(getByText('Browse by Pack')).toBeTruthy()
  })

  it('always reopens on the overview, even if it was left mid pack-detail', async () => {
    const pack = builtIn()
    const { getByText, rerender } = await renderDrawer()

    await fireEvent.press(getByText(pack.label))
    await waitFor(() => expect(getByText(/unlocked/)).toBeTruthy())

    await rerender(
      <Wrapper>
        <AchievementsDrawer visible={false} onDismiss={jest.fn()} unlockVersion={0} onUnlocksChanged={jest.fn()} mode={DEFAULT_MODE} difficulty='any' onConfirm={jest.fn()} />
      </Wrapper>
    )
    await rerender(
      <Wrapper>
        <AchievementsDrawer visible onDismiss={jest.fn()} unlockVersion={0} onUnlocksChanged={jest.fn()} mode={DEFAULT_MODE} difficulty='any' onConfirm={jest.fn()} />
      </Wrapper>
    )

    expect(getByText('Browse by Pack')).toBeTruthy()
  })

  it('only marks the drawer as a modal accessibility view while visible', async () => {
    const { getByTestId, rerender } = await renderDrawer()

    expect(getByTestId('achievements-drawer-panel').props.accessibilityViewIsModal).toBe(true)
    expect(getByTestId('achievements-drawer-panel').props.accessibilityElementsHidden).toBe(false)
    expect(getByTestId('achievements-drawer-panel').props.importantForAccessibility).toBe('yes')

    await rerender(
      <Wrapper>
        <AchievementsDrawer visible={false} onDismiss={jest.fn()} unlockVersion={0} onUnlocksChanged={jest.fn()} mode={DEFAULT_MODE} difficulty='any' onConfirm={jest.fn()} />
      </Wrapper>
    )

    // Closed state is deliberately hidden from accessibility tools (accessibilityElementsHidden),
    // so RTL's default queries skip it — includeHiddenElements opts back in for this assertion.
    const closedPanel = getByTestId('achievements-drawer-panel', { includeHiddenElements: true })
    expect(closedPanel.props.accessibilityViewIsModal).toBe(false)
    expect(closedPanel.props.accessibilityElementsHidden).toBe(true)
    expect(closedPanel.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  // The panel springs shut over the screen after visible flips false, so it keeps what it showed;
  // and closed, it doesn't follow the store, so a round elsewhere doesn't re-render it.
  it('keeps its stats while closing, ignores the store while closed, and catches up on reopening', async () => {
    seedStats({ solo: { played: 7, wins: 7, losses: 0, draws: 0 } })
    const drawer = (visible: boolean) => (
      <Wrapper>
        <AchievementsDrawer visible={visible} onDismiss={jest.fn()} unlockVersion={0} onUnlocksChanged={jest.fn()} mode={DEFAULT_MODE} difficulty='any' onConfirm={jest.fn()} />
      </Wrapper>
    )
    const { getByTestId, rerender } = await renderDrawer()
    const wins = () => within(getByTestId('stat-Wins', { includeHiddenElements: true })).getByText(/^\d+$/, { includeHiddenElements: true }).props.children

    await rerender(drawer(false))
    expect(wins()).toEqual(['7', ''])

    await act(async () => {
      seedStats({ solo: { played: 8, wins: 8, losses: 0, draws: 0 } })
    })
    expect(wins()).toEqual(['7', ''])

    await rerender(drawer(true))
    expect(wins()).toEqual(['8', ''])
  })

  it('re-fetches the unlock map when unlockVersion changes while already visible', async () => {
    const { rerender } = await renderDrawer({ unlockVersion: 0 })
    await waitFor(() => expect(mockGetPuzzleUnlockMap).toHaveBeenCalledTimes(1))

    // A real bump comes from Main.tsx's refreshUnlocks after a puzzle unlocks: this is what proves
    // the effect re-runs (not just that it ran once on mount).
    await rerender(
      <Wrapper>
        <AchievementsDrawer visible onDismiss={jest.fn()} unlockVersion={1} onUnlocksChanged={jest.fn()} mode={DEFAULT_MODE} difficulty='any' onConfirm={jest.fn()} />
      </Wrapper>
    )

    await waitFor(() => expect(mockGetPuzzleUnlockMap).toHaveBeenCalledTimes(2))
  })

  it('follows the stats store live while open: a round recorded elsewhere shows up with no refetch', async () => {
    seedStats({ solo: { played: 3, wins: 3, losses: 0, draws: 0 } })
    const { getByTestId } = await renderDrawer()
    expect(within(getByTestId('stat-Wins')).getByText('3')).toBeTruthy()

    await act(async () => {
      seedStats({ solo: { played: 4, wins: 4, losses: 0, draws: 0 } })
    })

    expect(within(getByTestId('stat-Wins')).getByText('4')).toBeTruthy()
  })

  describe('Stats', () => {
    it('shows the solo and Pass & Play records and every other counter, sourced from the stats store', async () => {
      seedStats({
        solo: { played: 15, wins: 12, losses: 3, draws: 0 },
        soloStreak: { currentWinStreak: 2, bestWinStreak: 7 },
        lettersGuessed: 150,
        lettersCorrect: 90,
        pnp: { played: 5, wins: 4, losses: 1, draws: 0 }
      })
      const { getByTestId } = await renderDrawer()

      await waitFor(() => expect(within(getByTestId('stat-Played')).getByText('15')).toBeTruthy())
      expect(within(getByTestId('stat-Wins')).getByText('12')).toBeTruthy()
      expect(within(getByTestId('stat-Losses')).getByText('3')).toBeTruthy()
      expect(within(getByTestId('stat-Win %')).getByText('80%')).toBeTruthy()
      expect(within(getByTestId('stat-Current Streak')).getByText('2')).toBeTruthy()
      expect(within(getByTestId('stat-Best Streak')).getByText('7')).toBeTruthy()
      expect(within(getByTestId('stat-Letters Guessed')).getByText('150')).toBeTruthy()
      expect(within(getByTestId('stat-Letters Correct')).getByText('90')).toBeTruthy()
      expect(within(getByTestId('stat-pnp-Played')).getByText('5')).toBeTruthy()
      expect(within(getByTestId('stat-pnp-Wins')).getByText('4')).toBeTruthy()
      expect(within(getByTestId('stat-pnp-Losses')).getByText('1')).toBeTruthy()
      expect(within(getByTestId('stat-pnp-Win %')).getByText('80%')).toBeTruthy()
    })

    it('shows 0% (not NaN or a crash) when nothing has been played yet, for both solo and pass & play', async () => {
      const { getByTestId } = await renderDrawer()

      await waitFor(() => expect(within(getByTestId('stat-Win %')).getByText('0%')).toBeTruthy())
      expect(within(getByTestId('stat-pnp-Win %')).getByText('0%')).toBeTruthy()
    })
  })

  describe('Achievements', () => {
    it('shows an earned achievement with when it was unlocked, and a locked one without', async () => {
      seedStats({ flawlessWins: 1 }, { flawless_bronze: Date.now() })
      const { getByText, getAllByText } = await renderDrawer()

      expect(getByText('Flawless Victory')).toBeTruthy()
      // flawless_bronze is the only unlock (nothing else in the seeded stats clears a threshold).
      expect(getAllByText('Unlocked today')).toHaveLength(1)
      // Its silver rung, still locked, is listed with its own description.
      expect(getByText('Spotless')).toBeTruthy()
      expect(getByText('Solve 10 puzzles without a single wrong guess.')).toBeTruthy()
    })

    it('lists the whole catalog, every rung of a ladder included', async () => {
      const { getByText } = await renderDrawer()

      for (const title of ['First Word', "Beginner's Luck", 'Getting Started', 'Word Wizard', 'Unstoppable', 'Mode Master', 'Completionist', 'Pack Rat', 'Master Curator', 'Social Butterfly', 'Devoted']) expect(getByText(title)).toBeTruthy()
    })
  })

  describe('Progress Backup', () => {
    it('shares a progress backup file when Export progress is pressed', async () => {
      mockShareProgressBackupFile.mockResolvedValue(true)
      const { getByText } = await renderDrawer()

      await fireEvent.press(getByText('Export'))

      await waitFor(() => expect(mockShareProgressBackupFile).toHaveBeenCalledTimes(1))
      expect(mockAlert).not.toHaveBeenCalled()
    })

    it("shows an alert when sharing isn't available on this device", async () => {
      mockShareProgressBackupFile.mockResolvedValue(false)
      const { getByText } = await renderDrawer()

      await fireEvent.press(getByText('Export'))

      await waitFor(() => expect(mockAlert).toHaveBeenCalledWith("Couldn't Share", expect.any(String)))
    })

    it('does nothing when the file picker is canceled', async () => {
      mockPickHangmanFile.mockResolvedValue(null)
      const onUnlocksChanged = jest.fn()
      const { getByText } = await renderDrawer({ onUnlocksChanged })

      await fireEvent.press(getByText('Import'))

      await waitFor(() => expect(mockPickHangmanFile).toHaveBeenCalled())
      expect(mockMergePuzzleUnlocks).not.toHaveBeenCalled()
      expect(onUnlocksChanged).not.toHaveBeenCalled()
    })

    it('merges a picked backup file and notifies the parent when Import succeeds', async () => {
      const payload = JSON.stringify({ unlocks: { animals: ['lion'] } })
      mockPickHangmanFile.mockResolvedValue(payload)
      mockMergePuzzleUnlocks.mockResolvedValue({ importedCount: 3, addedCount: 2 })
      const onUnlocksChanged = jest.fn()
      const { getByText } = await renderDrawer({ onUnlocksChanged })

      await fireEvent.press(getByText('Import'))

      await waitFor(() => expect(mockMergePuzzleUnlocks).toHaveBeenCalledWith(payload))
      expect(onUnlocksChanged).toHaveBeenCalledTimes(1)
      expect(mockAlert).toHaveBeenCalledWith('Import Complete', expect.stringContaining('Merged 3 entries'))
    })

    it('shows an invalid-backup alert and does not merge when the picked file is not valid JSON', async () => {
      mockPickHangmanFile.mockResolvedValue('not valid json')
      const onUnlocksChanged = jest.fn()
      const { getByText } = await renderDrawer({ onUnlocksChanged })

      await fireEvent.press(getByText('Import'))

      await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Invalid Backup', expect.any(String)))
      expect(mockMergePuzzleUnlocks).not.toHaveBeenCalled()
      expect(onUnlocksChanged).not.toHaveBeenCalled()
    })

    // parseProgressBackup (the real implementation, not mocked here) is what catches this — a
    // custom pack export has a `pack` key, not `unlocks`, so it's rejected before mergePuzzleUnlocks
    // ever runs, rather than silently merging zero entries.
    it('shows an invalid-backup alert when the picked file is a custom pack, not a progress backup', async () => {
      mockPickHangmanFile.mockResolvedValue(JSON.stringify({ pack: { key: 'custom:abc', label: 'My Pack', puzzles: [] } }))
      const { getByText } = await renderDrawer()

      await fireEvent.press(getByText('Import'))

      await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Invalid Backup', expect.any(String)))
      expect(mockMergePuzzleUnlocks).not.toHaveBeenCalled()
    })
  })

  describe('Danger Zone', () => {
    // Reset all progress goes through an in-app ConfirmDialog now, not window.confirm/Alert.alert
    // — a native dialog isn't reliable on web (some browser/automation environments silently
    // auto-decline it, indistinguishable from the player themselves canceling).
    it('does not clear anything when Reset all progress is pressed but the confirmation dialog is declined', async () => {
      seedStats({ solo: { played: 2, wins: 2, losses: 0, draws: 0 } })
      const onUnlocksChanged = jest.fn()
      const { getByText, queryByText } = await renderDrawer({ onUnlocksChanged })

      await fireEvent.press(getByText('Reset All Progress'))
      expect(getByText('Reset Progress?')).toBeTruthy()

      await fireEvent.press(getByText('Cancel'))

      expect(queryByText('Reset Progress?')).toBeNull()
      expect(mockClearPuzzleUnlocks).not.toHaveBeenCalled()
      expect(store.getState().achievements.stats.solo.wins).toBe(2)
      expect(onUnlocksChanged).not.toHaveBeenCalled()
    })

    it('clears the unlocked puzzles, every stat and every achievement, and notifies the parent, when Reset all progress is confirmed', async () => {
      seedStats({ solo: { played: 2, wins: 2, losses: 0, draws: 0 } }, { first_ever_win: Date.now() })
      const onUnlocksChanged = jest.fn()
      const { getByText } = await renderDrawer({ onUnlocksChanged })

      await fireEvent.press(getByText('Reset All Progress'))
      await fireEvent.press(getByText('Reset'))

      await waitFor(() => expect(mockClearPuzzleUnlocks).toHaveBeenCalledTimes(1))
      expect(store.getState().achievements).toEqual({ stats: createDefaultStats(), unlocked: {} })
      expect(onUnlocksChanged).toHaveBeenCalledTimes(1)
    })
  })
})
