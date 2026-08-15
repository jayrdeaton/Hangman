import { HapticPressProvider } from '@rific/haptic-press'
import { act, fireEvent, render as rtlRender, waitFor, within } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import * as RNPaper from 'react-native-paper'

import { AchievementsDrawer } from '@/components/AchievementsDrawer'
import { DEFAULT_MODE } from '@/modes/registry'
import { clearAchievements, DEFAULT_ACHIEVEMENT_STATS, getAchievementStats } from '@/utils/achievements'
import { alert } from '@/utils/alert'
import { pickHangmanFile, shareProgressBackupFile } from '@/utils/hangmanFile'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'
import { resolvePuzzle } from '@/utils/puzzlePicker'
import { clearPuzzleUnlocks, getPuzzleUnlockMap, mergePuzzleUnlocks } from '@/utils/unlocks'

// Spreading the real module keeps ACHIEVEMENT_DEFINITIONS/DEFAULT_ACHIEVEMENT_STATS working —
// only getAchievementStats/clearAchievements are overridden, so their behavior can be controlled
// per test.
jest.mock('@/utils/achievements', () => ({
  ...jest.requireActual('@/utils/achievements'),
  getAchievementStats: jest.fn(),
  clearAchievements: jest.fn().mockResolvedValue(undefined)
}))

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

const mockGetAchievementStats = jest.mocked(getAchievementStats)
const mockClearAchievements = jest.mocked(clearAchievements)
const mockMergePuzzleUnlocks = jest.mocked(mergePuzzleUnlocks)
const mockClearPuzzleUnlocks = jest.mocked(clearPuzzleUnlocks)
const mockGetPuzzleUnlockMap = jest.mocked(getPuzzleUnlockMap)
const mockPickHangmanFile = jest.mocked(pickHangmanFile)
const mockShareProgressBackupFile = jest.mocked(shareProgressBackupFile)
const mockAlert = jest.mocked(alert)
const mockResolvePuzzle = jest.mocked(resolvePuzzle)
const realResolvePuzzle: typeof resolvePuzzle = jest.requireActual('@/utils/puzzlePicker').resolvePuzzle

// ConfirmDialog (like RoundEndDialog in Game.test.tsx) defaults to the blurred/Portal-based
// rendering path and needs a react-native-paper Portal.Host ancestor — normally supplied by
// @rific/auto-paper's Provider at the app root. HapticPressProvider's real `paper` module is
// also injected here (see Haptic.tsx, the app's own root wiring) — without it, @rific/haptic-
// press's Button/IconButton fall back to a bare RN Pressable that drops accessibilityLabel
// entirely, which every backAction/Button query below (Close, Back to achievements, Random,
// Reset all progress, the confirm dialog's own buttons) relies on.
const Wrapper = ({ children }: { children: ReactNode }) => (
  <RNPaper.PaperProvider>
    <HapticPressProvider paper={RNPaper}>{children}</HapticPressProvider>
  </RNPaper.PaperProvider>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Wrapper })

const builtIn = () => getPuzzleManifest().filter((item) => item.count > 0)[0]

const renderDrawer = (overrides: Partial<React.ComponentProps<typeof AchievementsDrawer>> = {}) => render(<AchievementsDrawer visible onDismiss={jest.fn()} unlockVersion={0} onUnlocksChanged={jest.fn()} mode={DEFAULT_MODE} difficulty='any' onConfirm={jest.fn()} {...overrides} />)

const statsWithTotalSolved = (totalSolved: number) => ({ ...DEFAULT_ACHIEVEMENT_STATS, totalSolved })

describe('AchievementsDrawer', () => {
  beforeEach(() => {
    mockGetAchievementStats.mockReset().mockResolvedValue(statsWithTotalSolved(0))
    mockClearAchievements.mockClear()
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
    expect(getByText('Total progress')).toBeTruthy()
    expect(getByText('puzzles unlocked')).toBeTruthy()
    // Rendered regardless of unlock state — locked ones just show dimmed/muted (see
    // AchievementsDrawer.tsx's achievementIconLocked style).
    expect(getByText('No Hints Needed')).toBeTruthy()
    expect(getByText('Stats')).toBeTruthy()
    expect(getByText('Pass & play')).toBeTruthy()
    expect(getByText('Browse by pack')).toBeTruthy()
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

    // The whole overview (achievements list, "Browse by pack" section, everything) swaps out for
    // the pack's own puzzle list in place — not a dialog stacked on top of it — and the header now
    // shows the pack's own label instead of "Achievements" (opens on filter='all', masked
    // throughout since the mocked empty unlock map guarantees nothing is solved yet here).
    await waitFor(() => expect(queryByText('Browse by pack')).toBeNull())
    expect(queryByText('Achievements')).toBeNull()
    expect(await findByText(/unlocked/)).toBeTruthy()
    expect(await findByTestId(`puzzle-row-${puzzle.id}`)).toBeTruthy()

    await fireEvent.press(getByLabelText('Back to achievements'))

    // Back to "Achievements" appearing twice — the drawer's own title and the section label above
    // the achievement cards — same as before the pack row was ever pressed.
    expect(getAllByText('Achievements')).toHaveLength(2)
    expect(getByText('Browse by pack')).toBeTruthy()
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
    expect(mockAlert).toHaveBeenCalledWith('No puzzles available', 'No puzzles available for the selected packs and difficulty.')
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
    await waitFor(() => expect(queryByText('Browse by pack')).toBeNull())
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
    await waitFor(() => expect(queryByText('Browse by pack')).toBeNull())

    await act(async () => {
      getByTestId('achievements-drawer-panel').props.onAccessibilityEscape()
    })

    // Escape while browsing a pack must go back one step, exactly like the visible back-arrow —
    // not skip past the overview straight to closing the whole drawer.
    expect(onDismiss).not.toHaveBeenCalled()
    expect(getByText('Browse by pack')).toBeTruthy()
  })

  it('always reopens on the overview, even if it was left mid pack-detail', async () => {
    const pack = builtIn()
    const { getByText, rerender } = await renderDrawer()

    await fireEvent.press(getByText(pack.label))
    await waitFor(() => expect(getByText(/unlocked/)).toBeTruthy())

    await rerender(
      <RNPaper.PaperProvider>
        <AchievementsDrawer visible={false} onDismiss={jest.fn()} unlockVersion={0} onUnlocksChanged={jest.fn()} mode={DEFAULT_MODE} difficulty='any' onConfirm={jest.fn()} />
      </RNPaper.PaperProvider>
    )
    await rerender(
      <RNPaper.PaperProvider>
        <AchievementsDrawer visible onDismiss={jest.fn()} unlockVersion={0} onUnlocksChanged={jest.fn()} mode={DEFAULT_MODE} difficulty='any' onConfirm={jest.fn()} />
      </RNPaper.PaperProvider>
    )

    expect(getByText('Browse by pack')).toBeTruthy()
  })

  it('only marks the drawer as a modal accessibility view while visible', async () => {
    const { getByTestId, rerender } = await renderDrawer()

    expect(getByTestId('achievements-drawer-panel').props.accessibilityViewIsModal).toBe(true)
    expect(getByTestId('achievements-drawer-panel').props.accessibilityElementsHidden).toBe(false)
    expect(getByTestId('achievements-drawer-panel').props.importantForAccessibility).toBe('yes')

    await rerender(
      <RNPaper.PaperProvider>
        <AchievementsDrawer visible={false} onDismiss={jest.fn()} unlockVersion={0} onUnlocksChanged={jest.fn()} mode={DEFAULT_MODE} difficulty='any' onConfirm={jest.fn()} />
      </RNPaper.PaperProvider>
    )

    // Closed state is deliberately hidden from accessibility tools (accessibilityElementsHidden),
    // so RTL's default queries skip it — includeHiddenElements opts back in for this assertion.
    const closedPanel = getByTestId('achievements-drawer-panel', { includeHiddenElements: true })
    expect(closedPanel.props.accessibilityViewIsModal).toBe(false)
    expect(closedPanel.props.accessibilityElementsHidden).toBe(true)
    expect(closedPanel.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('re-fetches unlock/achievement stats when unlockVersion changes while already visible', async () => {
    mockGetAchievementStats.mockResolvedValueOnce(statsWithTotalSolved(3)).mockResolvedValueOnce(statsWithTotalSolved(4))
    const { getByTestId, rerender } = await renderDrawer({ unlockVersion: 0 })

    await waitFor(() => expect(within(getByTestId('stat-Won')).getByText('3')).toBeTruthy())

    // A real bump comes from Main.tsx's refreshUnlocks after a solve/loss — this is what actually
    // proves the effect re-runs (not just that it ran once on mount): a stale closure or a missing
    // dependency would leave this reading "3" forever instead of picking up the new fetch.
    await rerender(
      <RNPaper.PaperProvider>
        <AchievementsDrawer visible onDismiss={jest.fn()} unlockVersion={1} onUnlocksChanged={jest.fn()} mode={DEFAULT_MODE} difficulty='any' onConfirm={jest.fn()} />
      </RNPaper.PaperProvider>
    )

    await waitFor(() => expect(within(getByTestId('stat-Won')).getByText('4')).toBeTruthy())
  })

  describe('Stats', () => {
    it('shows Total played (won + lost, and separately wins + losses for pass & play), and every other counter, sourced from the fetched stats', async () => {
      mockGetAchievementStats.mockResolvedValue({
        ...DEFAULT_ACHIEVEMENT_STATS,
        totalSolved: 12,
        totalLost: 3,
        currentStreak: 2,
        bestStreak: 7,
        lettersGuessed: 150,
        lettersCorrect: 90,
        pnpWins: 4,
        pnpLosses: 1
      })
      const { getByTestId } = await renderDrawer()

      await waitFor(() => expect(within(getByTestId('stat-Total played')).getByText('15')).toBeTruthy())
      expect(within(getByTestId('stat-Won')).getByText('12')).toBeTruthy()
      expect(within(getByTestId('stat-Lost')).getByText('3')).toBeTruthy()
      expect(within(getByTestId('stat-Win %')).getByText('80%')).toBeTruthy()
      expect(within(getByTestId('stat-Current streak')).getByText('2')).toBeTruthy()
      expect(within(getByTestId('stat-Best streak')).getByText('7')).toBeTruthy()
      expect(within(getByTestId('stat-Letters guessed')).getByText('150')).toBeTruthy()
      expect(within(getByTestId('stat-Letters correct')).getByText('90')).toBeTruthy()
      expect(within(getByTestId('stat-pnp-Total played')).getByText('5')).toBeTruthy()
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

  describe('Achievement counts', () => {
    it('shows a ×N count next to Flawless Victory and No Hints Needed when unlocked, sourced from flawlessWins/noHintWins', async () => {
      mockGetAchievementStats.mockResolvedValue({
        ...DEFAULT_ACHIEVEMENT_STATS,
        unlockedIds: ['flawless', 'no_hints'],
        flawlessWins: 5,
        noHintWins: 3
      })
      const { findByText } = await renderDrawer()

      expect(await findByText('×5')).toBeTruthy()
      expect(await findByText('×3')).toBeTruthy()
    })

    it('shows a ×N count next to Collection Complete derived from how many packs are fully unlocked, not a stored counter', async () => {
      const [firstPack, secondPack] = getPuzzleManifest().filter((item) => item.count > 0)
      mockGetPuzzleUnlockMap.mockResolvedValue({
        [firstPack.key]: Array.from({ length: firstPack.count }, (_, i) => `id-${i}`),
        [secondPack.key]: Array.from({ length: secondPack.count }, (_, i) => `id-${i}`)
      })
      mockGetAchievementStats.mockResolvedValue({ ...DEFAULT_ACHIEVEMENT_STATS, unlockedIds: ['pack_complete'] })
      const { findByText } = await renderDrawer()

      expect(await findByText('×2')).toBeTruthy()
    })

    it('does not show a count next to a one-shot achievement like Getting Started even when unlocked', async () => {
      mockGetAchievementStats.mockResolvedValue({ ...DEFAULT_ACHIEVEMENT_STATS, unlockedIds: ['milestone_10'], totalSolved: 10 })
      const { getByText, queryByText } = await renderDrawer()

      expect(getByText('Getting Started')).toBeTruthy()
      expect(queryByText(/^×/)).toBeNull()
    })
  })

  describe('Progress backup', () => {
    it('shares a progress backup file when Export progress is pressed', async () => {
      mockShareProgressBackupFile.mockResolvedValue(true)
      const { getByText } = await renderDrawer()

      await fireEvent.press(getByText('Export progress'))

      await waitFor(() => expect(mockShareProgressBackupFile).toHaveBeenCalledTimes(1))
      expect(mockAlert).not.toHaveBeenCalled()
    })

    it("shows an alert when sharing isn't available on this device", async () => {
      mockShareProgressBackupFile.mockResolvedValue(false)
      const { getByText } = await renderDrawer()

      await fireEvent.press(getByText('Export progress'))

      await waitFor(() => expect(mockAlert).toHaveBeenCalledWith("Couldn't share", expect.any(String)))
    })

    it('does nothing when the file picker is canceled', async () => {
      mockPickHangmanFile.mockResolvedValue(null)
      const onUnlocksChanged = jest.fn()
      const { getByText } = await renderDrawer({ onUnlocksChanged })

      await fireEvent.press(getByText('Import progress'))

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

      await fireEvent.press(getByText('Import progress'))

      await waitFor(() => expect(mockMergePuzzleUnlocks).toHaveBeenCalledWith(payload))
      expect(onUnlocksChanged).toHaveBeenCalledTimes(1)
      expect(mockAlert).toHaveBeenCalledWith('Import complete', expect.stringContaining('Merged 3 entries'))
    })

    it('shows an invalid-backup alert and does not merge when the picked file is not valid JSON', async () => {
      mockPickHangmanFile.mockResolvedValue('not valid json')
      const onUnlocksChanged = jest.fn()
      const { getByText } = await renderDrawer({ onUnlocksChanged })

      await fireEvent.press(getByText('Import progress'))

      await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Invalid backup', expect.any(String)))
      expect(mockMergePuzzleUnlocks).not.toHaveBeenCalled()
      expect(onUnlocksChanged).not.toHaveBeenCalled()
    })

    // parseProgressBackup (the real implementation, not mocked here) is what catches this — a
    // custom pack export has a `pack` key, not `unlocks`, so it's rejected before mergePuzzleUnlocks
    // ever runs, rather than silently merging zero entries.
    it('shows an invalid-backup alert when the picked file is a custom pack, not a progress backup', async () => {
      mockPickHangmanFile.mockResolvedValue(JSON.stringify({ pack: { key: 'custom:abc', label: 'My Pack', puzzles: [] } }))
      const { getByText } = await renderDrawer()

      await fireEvent.press(getByText('Import progress'))

      await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Invalid backup', expect.any(String)))
      expect(mockMergePuzzleUnlocks).not.toHaveBeenCalled()
    })
  })

  describe('Danger zone', () => {
    // Reset all progress goes through an in-app ConfirmDialog now, not window.confirm/Alert.alert
    // — a native dialog isn't reliable on web (some browser/automation environments silently
    // auto-decline it, indistinguishable from the player themselves canceling).
    it('does not clear anything when Reset all progress is pressed but the confirmation dialog is declined', async () => {
      const onUnlocksChanged = jest.fn()
      const { getByText, getByTestId, queryByText } = await renderDrawer({ onUnlocksChanged })

      await fireEvent.press(getByText('Reset all progress'))
      expect(getByText('Reset progress?')).toBeTruthy()

      await fireEvent.press(getByTestId('confirm-dialog-cancel'))

      expect(queryByText('Reset progress?')).toBeNull()
      expect(mockClearPuzzleUnlocks).not.toHaveBeenCalled()
      expect(mockClearAchievements).not.toHaveBeenCalled()
      expect(onUnlocksChanged).not.toHaveBeenCalled()
    })

    it('clears unlocks and achievements and notifies the parent when Reset all progress is confirmed', async () => {
      const onUnlocksChanged = jest.fn()
      const { getByText, getByTestId } = await renderDrawer({ onUnlocksChanged })

      await fireEvent.press(getByText('Reset all progress'))
      await fireEvent.press(getByTestId('confirm-dialog-confirm'))

      await waitFor(() => expect(mockClearPuzzleUnlocks).toHaveBeenCalledTimes(1))
      expect(mockClearAchievements).toHaveBeenCalledTimes(1)
      expect(onUnlocksChanged).toHaveBeenCalledTimes(1)
    })
  })
})
