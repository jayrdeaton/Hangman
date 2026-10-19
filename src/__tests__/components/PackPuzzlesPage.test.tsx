import { FeedbackPressProvider } from '@rific/feedback-press'
import { fireEvent, render as rtlRender } from '@testing-library/react-native'
import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import * as RNPaper from 'react-native-paper'
import { PaperProvider } from 'react-native-paper'
import { Provider as ReduxProvider } from 'react-redux'

import { PackPuzzlesPage } from '@/components/PackPuzzlesPage'
import { CatalogProvider } from '@/hooks/useCatalog'
import { DEFAULT_MODE } from '@/modes/registry'
import { store } from '@/redux/store'
import { alert } from '@/utils/alert'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'
import { resolvePuzzle } from '@/utils/puzzlePicker'
import { getPuzzleUnlockMap } from '@/utils/unlocks'

// @rific/feedback-press no longer auto-detects react-native-paper (see Haptic.tsx's own comment
// on this) - without an explicit FeedbackPressProvider paper={RNPaper} ancestor, every Button/
// IconButton this page renders (including the puzzle rows and header Back) falls back to a
// bare, unstyled Pressable that doesn't carry the same testID/accessibilityLabel wiring. The store
// and the catalog counters are what the page reads the active player's unlocked puzzles through
// (usePuzzleUnlocks).
const Wrapper = ({ children }: { children: ReactNode }) => (
  <ReduxProvider store={store}>
    <CatalogProvider>
      <FeedbackPressProvider paper={RNPaper}>
        <PaperProvider>{children}</PaperProvider>
      </FeedbackPressProvider>
    </CatalogProvider>
  </ReduxProvider>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Wrapper })

jest.mock('@/utils/alert', () => ({
  alert: jest.fn().mockResolvedValue(undefined),
  confirm: jest.fn().mockResolvedValue(true)
}))

jest.mock('@/utils/unlocks', () => ({
  ...jest.requireActual('@/utils/unlocks'),
  getPuzzleUnlockMap: jest.fn()
}))

// resolveChosenPuzzle (real, what tapping a specific puzzle uses) stays untouched - only
// resolvePuzzle (Play This Pack's own path) is overridden, and only for the one test below that needs to
// prove the parent screen's difficulty filter actually reaches it; every other test restores the
// real implementation in beforeEach so it exercises genuine resolution against real pack data.
jest.mock('@/utils/puzzlePicker', () => ({
  ...jest.requireActual('@/utils/puzzlePicker'),
  resolvePuzzle: jest.fn()
}))

const mockAlert = jest.mocked(alert)
const mockGetPuzzleUnlockMap = jest.mocked(getPuzzleUnlockMap)
const mockResolvePuzzle = jest.mocked(resolvePuzzle)
const realResolvePuzzle: typeof resolvePuzzle = jest.requireActual('@/utils/puzzlePicker').resolvePuzzle

// The real, smallest built-in pack - small enough that FlatList's initial render window covers
// every puzzle in it, unlike Movies' 9,091.
const smallestPack = () =>
  getPuzzleManifest()
    .filter((item) => item.count > 0)
    .sort((a, b) => a.count - b.count)[0]

// PacksScreen's popover host for the page's filters: none open, unless a test opens one.
const closedHost = () => ({ openId: null, toggle: jest.fn(), close: jest.fn() })

const renderPackPuzzles = (overrides: Partial<ComponentProps<typeof PackPuzzlesPage>> = {}) => render(<PackPuzzlesPage visible packKey={smallestPack().key} mode={DEFAULT_MODE} difficulty='any' onDismiss={jest.fn()} onConfirm={jest.fn()} onOnlyThisPack={jest.fn()} popoverHost={closedHost()} {...overrides} />)

// Row rendering, masking, and the solved/unsolved/all filter itself are PackPuzzleList's own
// contract - covered in PackPuzzleList.test.tsx. This file only covers what's specific to the
// page wrapping it: the header, the footer (Play This Pack and Only This Pack), and that a
// row tap actually reaches the parent's onConfirm/onDismiss through PackPuzzleList's onPlayPuzzle prop.
describe('PackPuzzlesPage', () => {
  beforeEach(() => {
    mockAlert.mockClear()
    mockGetPuzzleUnlockMap.mockReset()
    mockGetPuzzleUnlockMap.mockResolvedValue({})
    mockResolvePuzzle.mockReset()
    mockResolvePuzzle.mockImplementation(realResolvePuzzle)
  })

  it("titles the header with the pack's own name, with the unlock progress delegated to PackPuzzleList underneath it", async () => {
    const pack = smallestPack()
    const { getByRole, getAllByText, findByText, queryByText } = await renderPackPuzzles()

    expect(getByRole('header', { name: pack.label })).toBeTruthy()
    // Only the header: PackPuzzleList's summary under it doesn't repeat the name.
    expect(getAllByText(pack.label)).toHaveLength(1)
    expect(queryByText('Pack')).toBeNull()
    expect(await findByText(`0 of ${pack.count} unlocked`)).toBeTruthy()
  })

  // The page's own catcher, under the list (which carries its own over its rows): a tap on Back or a
  // footer button with a filter open only closes the filter.
  it('covers its header and footer with a press away catcher while a filter is open', async () => {
    const host = { ...closedHost(), openId: 'pack-status' }
    const onDismiss = jest.fn()
    const { getAllByLabelText } = await renderPackPuzzles({ popoverHost: host, onDismiss })

    const catchers = getAllByLabelText('Dismiss')
    expect(catchers).toHaveLength(2)
    await fireEvent.press(catchers[0])

    expect(host.close).toHaveBeenCalledTimes(1)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  // A custom pack's name can be 60 characters: the title is cut to one line, in the room the header row
  // leaves beside the back arrow.
  it('keeps the title to one line, beside the back arrow', async () => {
    const pack = smallestPack()
    const { getByRole } = await renderPackPuzzles()

    const title = getByRole('header', { name: pack.label })
    expect(title.props.numberOfLines).toBe(1)
    expect(StyleSheet.flatten(title.props.style)).toMatchObject({ flex: 1 })
  })

  it('plays the exact puzzle tapped, not a random draw from the rest of the pack, and closes itself so the started round is actually visible', async () => {
    const pack = smallestPack()
    const puzzle = getPuzzlesForCategory(pack.key)[0]
    const onConfirm = jest.fn()
    const onDismiss = jest.fn()
    const { getByTestId } = await renderPackPuzzles({ onConfirm, onDismiss })

    await fireEvent.press(getByTestId(`puzzle-row-${puzzle.id}`))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const [payload, config] = onConfirm.mock.calls[0]
    expect(payload.puzzleId).toBe(puzzle.id)
    expect(payload.packKey).toBe(pack.key)
    expect(payload.phrase.replace(/ /g, '')).toBe(puzzle.answer.replace(/[^A-Za-z]/g, '').toUpperCase())
    expect(config.sourceMode).toBe('random')
    // Without this, the player is left staring at the puzzle list on top of the round that just
    // started, unable to see or reach the board until they find and tap the close icon themselves.
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('draws a random puzzle from just this pack when Play This Pack is pressed, and closes itself the same way picking a specific puzzle does', async () => {
    const pack = smallestPack()
    const onConfirm = jest.fn()
    const onDismiss = jest.fn()
    const { getByText } = await renderPackPuzzles({ onConfirm, onDismiss })

    await fireEvent.press(getByText('Play This Pack'))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const [payload, config] = onConfirm.mock.calls[0]
    expect(payload.packKey).toBe(pack.key)
    // One pack, so the game screen's Next keeps drawing from it.
    expect(payload.packScope).toBe('single')
    expect(config.sourceMode).toBe('random')
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not close itself when Play This Pack fails to find anything (the alert is the only feedback, nothing to dismiss out of)', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: false, error: 'No puzzles available for the selected packs and difficulty.' })
    const onDismiss = jest.fn()
    const { getByText } = await renderPackPuzzles({ onDismiss, difficulty: 'hard' })

    await fireEvent.press(getByText('Play This Pack'))

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it("passes the parent screen's difficulty filter through to the Play This Pack draw", async () => {
    const pack = smallestPack()
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: { phrase: 'X', mode: DEFAULT_MODE, sourceMode: 'random', packKey: pack.key, packLabel: pack.label, puzzleId: 'x', difficultyTier: 'hard' } })
    const { getByText } = await renderPackPuzzles({ difficulty: 'hard' })

    await fireEvent.press(getByText('Play This Pack'))

    expect(mockResolvePuzzle).toHaveBeenCalledWith(expect.objectContaining({ difficulty: 'hard' }), [pack.key], expect.anything())
  })

  it("passes this pack's own freshly-fetched unlock map through to Play This Pack, so it can prefer a puzzle the player hasn't unlocked yet", async () => {
    const pack = smallestPack()
    mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: ['solved-1'] })
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: { phrase: 'X', mode: DEFAULT_MODE, sourceMode: 'random', packKey: pack.key, packLabel: pack.label, puzzleId: 'x', difficultyTier: 'easy' } })
    const { getByText, findByText } = await renderPackPuzzles()

    // Waits for the unlock-map fetch to resolve (PackPuzzleList's own progress header reads the
    // same mocked getPuzzleUnlockMap) before pressing Play This Pack, so the assertion below isn't racing
    // against a still-empty {} from before it settled.
    await findByText(`1 of ${pack.count} unlocked`)

    await fireEvent.press(getByText('Play This Pack'))

    expect(mockResolvePuzzle).toHaveBeenCalledWith(expect.anything(), [pack.key], { [pack.key]: ['solved-1'] })
  })

  it('shows an alert instead of confirming when Play This Pack finds nothing for the current filter', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: false, error: 'No puzzles available for the selected packs and difficulty.' })
    const onConfirm = jest.fn()
    const { getByText } = await renderPackPuzzles({ onConfirm, difficulty: 'hard' })

    await fireEvent.press(getByText('Play This Pack'))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(mockAlert).toHaveBeenCalledWith('No Puzzles Available', 'No puzzles available for the selected packs and difficulty.')
  })

  it('steps back via the header back arrow', async () => {
    const onDismiss = jest.fn()
    const { getByLabelText } = await renderPackPuzzles({ onDismiss })

    await fireEvent.press(getByLabelText('Back'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('renders no header, list, or footer while no pack has ever been chosen', async () => {
    const { queryByText } = await render(<PackPuzzlesPage visible={false} packKey={null} mode={DEFAULT_MODE} difficulty='any' onDismiss={jest.fn()} onConfirm={jest.fn()} onOnlyThisPack={jest.fn()} popoverHost={closedHost()} />)

    expect(queryByText('Play This Pack', { includeHiddenElements: true })).toBeNull()
    expect(queryByText('Only This Pack', { includeHiddenElements: true })).toBeNull()
  })

  // The pack selection becomes just this pack (Choose Packs' selection, so Ready draws from it alone).
  describe('Only This Pack', () => {
    it('hands the caller this pack and closes itself, starting nothing', async () => {
      const pack = smallestPack()
      const onOnlyThisPack = jest.fn()
      const onConfirm = jest.fn()
      const onDismiss = jest.fn()
      const { getByText } = await renderPackPuzzles({ onOnlyThisPack, onConfirm, onDismiss })

      await fireEvent.press(getByText('Only This Pack'))

      expect(onOnlyThisPack).toHaveBeenCalledWith(pack.key)
      expect(onDismiss).toHaveBeenCalledTimes(1)
      expect(onConfirm).not.toHaveBeenCalled()
      expect(mockResolvePuzzle).not.toHaveBeenCalled()
    })

    it('is off while the selection is already just this pack', async () => {
      const onOnlyThisPack = jest.fn()
      const onDismiss = jest.fn()
      const { getByRole } = await renderPackPuzzles({ onOnlyThisPack, onDismiss, onlyThisPackSelected: true })

      const button = getByRole('button', { name: 'Only This Pack' })
      expect(button.props.accessibilityState?.disabled).toBe(true)
      await fireEvent.press(button)

      expect(onOnlyThisPack).not.toHaveBeenCalled()
      expect(onDismiss).not.toHaveBeenCalled()
    })
  })
})
