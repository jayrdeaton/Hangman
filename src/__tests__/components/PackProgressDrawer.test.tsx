import { FeedbackPressProvider } from '@rific/feedback-press'
import { act, fireEvent, render as rtlRender, waitFor } from '@testing-library/react-native'
import { type ReactElement, type ReactNode, useEffect } from 'react'
import * as RNPaper from 'react-native-paper'
import { Provider as ReduxProvider } from 'react-redux'

import { PackProgressDrawer } from '@/components/PackProgressDrawer'
import { type CatalogActions, CatalogProvider, useCatalogActions } from '@/hooks/useCatalog'
import { DEFAULT_MODE } from '@/modes/registry'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { store } from '@/redux/store'
import { alert } from '@/utils/alert'
import { GUEST_PLAYER_KEY } from '@/utils/players'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'
import { resolvePuzzle } from '@/utils/puzzlePicker'
import { getPuzzleUnlockMap } from '@/utils/unlocks'

// Real getPuzzleUnlockMap reads AsyncStorage, globally stubbed to always return null - mocked here
// instead so a test can put puzzles in a pack without needing real storage.
jest.mock('@/utils/unlocks', () => ({
  ...jest.requireActual('@/utils/unlocks'),
  getPuzzleUnlockMap: jest.fn()
}))

jest.mock('@/utils/alert', () => ({
  alert: jest.fn().mockResolvedValue(undefined)
}))

// resolvePuzzle (Play This Pack's own path) is overridden, mirroring PackPuzzlesDrawer.test.tsx's
// identical setup - every test restores the real implementation in beforeEach so it exercises
// genuine resolution against real pack data unless a specific test needs to force a failure.
jest.mock('@/utils/puzzlePicker', () => ({
  ...jest.requireActual('@/utils/puzzlePicker'),
  resolvePuzzle: jest.fn()
}))

// Paper's Icon wrapped (still the real one), to see which glyph each pack row's trailing icon gets.
jest.mock('react-native-paper', () => {
  const actual = jest.requireActual('react-native-paper')
  return { ...actual, Icon: jest.fn(actual.Icon) }
})

const mockIcon = jest.mocked(RNPaper.Icon)
const mockGetPuzzleUnlockMap = jest.mocked(getPuzzleUnlockMap)
const mockAlert = jest.mocked(alert)
const mockResolvePuzzle = jest.mocked(resolvePuzzle)
const realResolvePuzzle: typeof resolvePuzzle = jest.requireActual('@/utils/puzzlePicker').resolvePuzzle

// The app's catalog counters, so a test can move the unlock count the way a win elsewhere would.
let catalog: CatalogActions | null = null
const CatalogProbe = () => {
  const actions = useCatalogActions()
  useEffect(() => {
    catalog = actions
  }, [actions])
  return null
}

// FeedbackPressProvider's real `paper` module is injected here (see Providers.tsx, the app's own
// root wiring) - without it, @rific/feedback-press's Button/IconButton fall back to a bare RN
// Pressable that drops accessibilityLabel entirely, which every backAction/Button query below
// (Close, Back to pack progress, Play This Pack) relies on. The store and the catalog counters are what the
// drawer reads the active player's unlocked puzzles through (usePuzzleUnlocks).
const Wrapper = ({ children }: { children: ReactNode }) => (
  <ReduxProvider store={store}>
    <CatalogProvider>
      <CatalogProbe />
      <FeedbackPressProvider paper={RNPaper}>
        <RNPaper.PaperProvider>{children}</RNPaper.PaperProvider>
      </FeedbackPressProvider>
    </CatalogProvider>
  </ReduxProvider>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Wrapper })

// What LoadoutScreen passes in (its own manifest); built once, so it's the same array every render.
const MANIFEST = getPuzzleManifest().filter((item) => item.count > 0)
const builtIn = () => MANIFEST[0]

type DrawerProps = React.ComponentProps<typeof PackProgressDrawer>
const drawer = (overrides: Partial<DrawerProps> = {}) => <PackProgressDrawer visible onDismiss={jest.fn()} manifest={MANIFEST} mode={DEFAULT_MODE} difficulty='any' onConfirm={jest.fn()} {...overrides} />
const renderDrawer = (overrides: Partial<DrawerProps> = {}) => render(drawer(overrides))

describe('PackProgressDrawer', () => {
  beforeEach(() => {
    store.dispatch(activePlayerActions.setActivePlayer(null))
    mockGetPuzzleUnlockMap.mockReset().mockResolvedValue({})
    mockAlert.mockClear()
    mockResolvePuzzle.mockReset()
    mockResolvePuzzle.mockImplementation(realResolvePuzzle)
  })

  it('renders as a drawer panel with the total-progress card and a row per pack, and nothing of the old stats, achievements or backup', async () => {
    const pack = builtIn()
    const { getByText, getByTestId, queryByText } = await renderDrawer()

    expect(getByText('Pack Progress')).toBeTruthy()
    expect(getByTestId('pack-progress-drawer-panel')).toBeTruthy()
    expect(getByText('Total Progress')).toBeTruthy()
    expect(getByText('Puzzles Unlocked')).toBeTruthy()
    expect(getByText('Browse by Pack')).toBeTruthy()
    expect(getByText(pack.label)).toBeTruthy()
    // Those moved to StatsScreen and the Settings sheet.
    for (const gone of ['Stats', 'Achievements', 'No Hints Needed', 'Progress Backup', 'Export', 'Reset All Progress']) expect(queryByText(gone)).toBeNull()
  })

  it('marks a pack whose every puzzle is unlocked with a trophy, and the rest with a chevron', async () => {
    const pack = builtIn()
    mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: getPuzzlesForCategory(pack.key).map((puzzle) => puzzle.id) })
    mockIcon.mockClear()
    const { findByText } = await renderDrawer()
    await findByText(`${pack.count} of ${pack.count} unlocked`)

    // Every row starts on a chevron until the unlock map is in, so a trophy means the full pack got one.
    const glyphs = mockIcon.mock.calls.map(([props]) => props.source)
    expect(glyphs).toContain('trophy')
    expect(glyphs).toContain('chevron-right')
  })

  // LoadoutScreen's manifest includes custom packs and is rebuilt when one is saved, so the drawer has
  // to list exactly what it's given, picking a new one up on open.
  it('lists exactly the manifest it is given, and picks up a changed one when it opens', async () => {
    const customPack = { key: 'custom:test', label: 'My Words', count: 3, group: 'Custom' } as (typeof MANIFEST)[number]
    const { queryByText, findByText, rerender } = await renderDrawer({ visible: false })
    expect(queryByText('My Words', { includeHiddenElements: true })).toBeNull()

    await rerender(drawer({ visible: false, manifest: [customPack, ...MANIFEST] }))
    await rerender(drawer({ manifest: [customPack, ...MANIFEST] }))

    expect(await findByText('My Words')).toBeTruthy()
    expect(await findByText('0 of 3 unlocked')).toBeTruthy()
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
    const { getByText, getByRole, queryByText, queryByTestId, findByTestId, findByText, getByLabelText } = await renderDrawer({ onDismiss })

    // The detail content (the pack's full puzzle list) isn't rendered until its row is pressed.
    expect(queryByTestId(`puzzle-row-${puzzle.id}`)).toBeNull()

    await fireEvent.press(getByText(pack.label))

    // The whole overview (the total-progress card, "Browse by Pack" section, everything) swaps out
    // for the pack's own puzzle list in place - not a dialog stacked on top of it - and the header
    // now reads the pack's own name instead of "Pack Progress" (opens on filter='all', masked
    // throughout since the mocked empty unlock map guarantees nothing is solved yet here).
    await waitFor(() => expect(queryByText('Browse by Pack')).toBeNull())
    expect(queryByText('Pack Progress')).toBeNull()
    expect(getByRole('header', { name: pack.label })).toBeTruthy()
    expect(await findByText(/unlocked/)).toBeTruthy()
    expect(await findByTestId(`puzzle-row-${puzzle.id}`)).toBeTruthy()

    await fireEvent.press(getByLabelText('Back to pack progress'))

    // Back on the overview, the same as before the pack row was ever pressed.
    expect(getByText('Pack Progress')).toBeTruthy()
    expect(getByText('Browse by Pack')).toBeTruthy()
    expect(queryByTestId(`puzzle-row-${puzzle.id}`)).toBeNull()
    // Back is a local step-back, not a dismiss - the whole drawer must stay open.
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('plays the exact puzzle tapped in the pack detail view, not a random draw, and closes the whole drawer the same way Play This Pack does', async () => {
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

  it("draws a random puzzle from the pack being browsed when Play This Pack is pressed, and closes the whole drawer the same way PackPuzzlesDrawer's does", async () => {
    const pack = builtIn()
    const onConfirm = jest.fn()
    const onDismiss = jest.fn()
    const { getByText } = await renderDrawer({ onConfirm, onDismiss })

    await fireEvent.press(getByText(pack.label))
    await waitFor(() => expect(getByText('Play This Pack')).toBeTruthy())

    await fireEvent.press(getByText('Play This Pack'))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const [payload, config] = onConfirm.mock.calls[0]
    expect(payload.packKey).toBe(pack.key)
    // One pack, so the game screen's Next keeps drawing from it.
    expect(payload.packScope).toBe('single')
    expect(config.sourceMode).toBe('random')
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not close when Play This Pack fails to find anything for the pack being browsed (the alert is the only feedback)', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: false, error: 'No puzzles available for the selected packs and difficulty.' })
    const pack = builtIn()
    const onConfirm = jest.fn()
    const onDismiss = jest.fn()
    const { getByText } = await renderDrawer({ onConfirm, onDismiss })

    await fireEvent.press(getByText(pack.label))
    await waitFor(() => expect(getByText('Play This Pack')).toBeTruthy())

    await fireEvent.press(getByText('Play This Pack'))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
    expect(mockAlert).toHaveBeenCalledWith('No Puzzles Available', 'No puzzles available for the selected packs and difficulty.')
  })

  it("passes the loadout's current mode/difficulty through to the Play This Pack draw, not pickers of its own", async () => {
    const pack = builtIn()
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: { phrase: 'X', mode: DEFAULT_MODE, sourceMode: 'random', packKey: pack.key, packLabel: pack.label, puzzleId: 'x', difficultyTier: 'hard' } })
    const { getByText } = await renderDrawer({ difficulty: 'hard' })

    await fireEvent.press(getByText(pack.label))
    await waitFor(() => expect(getByText('Play This Pack')).toBeTruthy())

    await fireEvent.press(getByText('Play This Pack'))

    expect(mockResolvePuzzle).toHaveBeenCalledWith(expect.objectContaining({ difficulty: 'hard', mode: DEFAULT_MODE }), [pack.key], expect.anything())
  })

  it("passes this pack's own freshly-fetched unlock map through to Play This Pack, so it can prefer a puzzle the player hasn't unlocked yet", async () => {
    const pack = builtIn()
    mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: ['solved-1'] })
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: { phrase: 'X', mode: DEFAULT_MODE, sourceMode: 'random', packKey: pack.key, packLabel: pack.label, puzzleId: 'x', difficultyTier: 'easy' } })
    const { getByText, findByText } = await renderDrawer()

    await fireEvent.press(getByText(pack.label))
    // Waits for the unlock-map fetch to resolve (PackPuzzleList's own progress header reads the
    // same mocked getPuzzleUnlockMap) before pressing Play This Pack, so the assertion below isn't racing
    // against a still-empty {} from before it settled.
    await findByText(`1 of ${pack.count} unlocked`)

    await fireEvent.press(getByText('Play This Pack'))

    expect(mockResolvePuzzle).toHaveBeenCalledWith(expect.anything(), [pack.key], { [pack.key]: ['solved-1'] })
  })

  it('shows a different pack correctly after returning from an earlier one', async () => {
    const [firstPack, secondPack] = getPuzzleManifest().filter((item) => item.count > 0)
    const { getByText, getByRole, getAllByText, queryByText, getByLabelText } = await renderDrawer()

    await fireEvent.press(getByText(firstPack.label))
    await waitFor(() => expect(getByRole('header', { name: firstPack.label })).toBeTruthy())

    await fireEvent.press(getByLabelText('Back to pack progress'))
    await fireEvent.press(getByText(secondPack.label))

    // Not just "some pack" reappearing - the SECOND pack's own label and progress, not a stale
    // read of the first one PackPuzzleList was keyed on moments ago: in the header and in the pack
    // summary row under it.
    await waitFor(() => expect(queryByText('Browse by Pack')).toBeNull())
    expect(getByRole('header', { name: secondPack.label })).toBeTruthy()
    expect(getAllByText(secondPack.label)).toHaveLength(2)
    expect(queryByText(firstPack.label)).toBeNull()
  })

  // Trimming the pack selection is the loadout's and Choose Packs' job: this drawer reviews every pack.
  it('offers Play This Pack, and no Only This Pack, in a pack it drilled into', async () => {
    const { getByText, queryByText, findByText } = await renderDrawer()

    await fireEvent.press(getByText(builtIn().label))

    expect(await findByText('Play This Pack')).toBeTruthy()
    expect(queryByText('Only This Pack')).toBeNull()
  })

  it('routes onAccessibilityEscape to a local step-back while browsing a pack, and to Close from the overview', async () => {
    const pack = builtIn()
    const onDismiss = jest.fn()
    const { getByText, getByTestId, queryByText } = await renderDrawer({ onDismiss })

    await act(async () => {
      getByTestId('pack-progress-drawer-panel').props.onAccessibilityEscape()
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)

    onDismiss.mockClear()
    await fireEvent.press(getByText(pack.label))
    await waitFor(() => expect(queryByText('Browse by Pack')).toBeNull())

    await act(async () => {
      getByTestId('pack-progress-drawer-panel').props.onAccessibilityEscape()
    })

    // Escape while browsing a pack must go back one step, exactly like the visible back-arrow -
    // not skip past the overview straight to closing the whole drawer.
    expect(onDismiss).not.toHaveBeenCalled()
    expect(getByText('Browse by Pack')).toBeTruthy()
  })

  it('always reopens on the overview, even if it was left mid pack-detail', async () => {
    const pack = builtIn()
    const { getByText, rerender } = await renderDrawer()

    await fireEvent.press(getByText(pack.label))
    await waitFor(() => expect(getByText(/unlocked/)).toBeTruthy())

    await rerender(drawer({ visible: false }))
    await rerender(drawer())

    expect(getByText('Browse by Pack')).toBeTruthy()
  })

  it('only marks the drawer as a modal accessibility view while visible', async () => {
    const { getByTestId, rerender } = await renderDrawer()

    expect(getByTestId('pack-progress-drawer-panel').props.accessibilityViewIsModal).toBe(true)
    expect(getByTestId('pack-progress-drawer-panel').props.accessibilityElementsHidden).toBe(false)
    expect(getByTestId('pack-progress-drawer-panel').props.importantForAccessibility).toBe('yes')

    await rerender(drawer({ visible: false }))

    // Closed state is deliberately hidden from accessibility tools (accessibilityElementsHidden),
    // so RTL's default queries skip it - includeHiddenElements opts back in for this assertion.
    const closedPanel = getByTestId('pack-progress-drawer-panel', { includeHiddenElements: true })
    expect(closedPanel.props.accessibilityViewIsModal).toBe(false)
    expect(closedPanel.props.accessibilityElementsHidden).toBe(true)
    expect(closedPanel.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('re-fetches the unlock map when the unlock count moves while already visible', async () => {
    await renderDrawer()
    await waitFor(() => expect(mockGetPuzzleUnlockMap).toHaveBeenCalledTimes(1))

    // A real bump comes from useCatalog's refreshUnlocks after a puzzle unlocks: this is what proves
    // the read runs again (not just that it ran once on mount).
    await act(async () => catalog!.refreshUnlocks())

    await waitFor(() => expect(mockGetPuzzleUnlockMap).toHaveBeenCalledTimes(2))
  })

  // Everything belongs to a player (2026-10-17).
  it("reads the active player's unlocked puzzles, and the new player's when the player changes", async () => {
    const pack = builtIn()
    mockGetPuzzleUnlockMap.mockImplementation((playerKey) => Promise.resolve(playerKey === 'profile-a' ? { [pack.key]: ['one', 'two'] } : {}))
    const { findByText } = await renderDrawer()
    await waitFor(() => expect(mockGetPuzzleUnlockMap).toHaveBeenCalledWith(GUEST_PLAYER_KEY))

    await act(async () => {
      store.dispatch(activePlayerActions.setActivePlayer('profile-a'))
    })

    expect(mockGetPuzzleUnlockMap).toHaveBeenLastCalledWith('profile-a')
    expect(await findByText(`2 of ${pack.count.toLocaleString('en-US')} unlocked`)).toBeTruthy()
  })
})
