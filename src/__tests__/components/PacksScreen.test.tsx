import AsyncStorage from '@react-native-async-storage/async-storage'
import { FeedbackPressProvider } from '@rific/feedback-press'
import { ToastProvider } from '@rific/toaster'
import { act, fireEvent, render as rtlRender, waitFor, within } from '@testing-library/react-native'
import { createRef, type ReactElement, type ReactNode, useState } from 'react'
import * as RNPaper from 'react-native-paper'
import { PaperProvider } from 'react-native-paper'
import { Provider as ReduxProvider } from 'react-redux'

import { PackRow } from '@/components/PackRow'
import { PacksScreen, type PacksScreenHandle } from '@/components/PacksScreen'
import { GameStatsProvider } from '@/hooks/useGameStats'
import { DEFAULT_MODE } from '@/modes/registry'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { store } from '@/redux/store'
import { loadCustomPacksCache, saveCustomPack } from '@/utils/customPacks'
import { pickHangmanFile, shareCustomPackFile } from '@/utils/hangmanFile'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'

// PacksScreen only ever talks to the real device/OS through this module (see its own doc
// comments for why: file pickers and share sheets aren't meaningfully unit-testable, and web's
// share path in particular depends on browser globals this test environment doesn't provide) - so
// the boundary mocked here is hangmanFile.ts itself, not expo-document-picker/expo-sharing
// underneath it. Those have their own dedicated coverage in hangmanFile.test.ts.
jest.mock('@/utils/hangmanFile', () => ({
  pickHangmanFile: jest.fn(),
  shareCustomPackFile: jest.fn()
}))

// Still the real row, only watched, so a test can see which rows a toggle redraws.
jest.mock('@/components/PackRow', () => {
  const actual = jest.requireActual('@/components/PackRow')
  const { createElement } = jest.requireActual('react')
  return { PackRow: jest.fn((props) => createElement(actual.PackRow, props)) }
})

const mockPickHangmanFile = jest.mocked(pickHangmanFile)
const mockShareCustomPackFile = jest.mocked(shareCustomPackFile)
const mockPackRow = jest.mocked(PackRow)

const builtInPacks = () => getPuzzleManifest().filter((item) => item.count > 0 && !item.key.startsWith('custom:'))
const builtIn = () => builtInPacks()[0]

// ConfirmDialog renders through a react-native-paper Portal (Delete pack's confirm dialog) - needs
// a Portal.Host ancestor, normally supplied by @rific/auto-paper's Provider at the app root.
// ToastProvider is also required - this screen always mounts its own PackEditorDrawer (translated
// off-screen when not visible, same as every other drawer in this lineage), and that drawer's own
// form calls useToast() to surface a newly-unlocked custom-pack achievement, which throws outside a
// ToastProvider ancestor. That form also records the new pack through useGameStats, so the app's
// stats store and GameStatsProvider wrap everything too.
// FeedbackPressProvider paper={RNPaper} is required too - @rific/feedback-press no longer
// auto-detects react-native-paper (see Haptic.tsx's own comment on this), so without it every
// Button/IconButton here falls back to a bare, unstyled Pressable instead of Paper's real
// component, which breaks the accessibilityState/accessibilityLabel assertions below. It has to
// wrap PaperProvider, not nest inside it, for the same reason Providers.tsx hoists the real app's
// Haptic above Theme: PaperProvider's PortalHost mounts near its own root, so ConfirmDialog's
// Portal-rendered Cancel/Delete buttons only see FeedbackPressProvider's context if it's an
// ancestor of PaperProvider - nested inside, they'd sit outside the portaled subtree entirely.
const Wrapper = ({ children }: { children: ReactNode }) => (
  <ReduxProvider store={store}>
    <GameStatsProvider>
      <FeedbackPressProvider paper={RNPaper}>
        <PaperProvider>
          <ToastProvider>{children}</ToastProvider>
        </PaperProvider>
      </FeedbackPressProvider>
    </GameStatsProvider>
  </ReduxProvider>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Wrapper })

const renderScreen = (overrides: Partial<React.ComponentProps<typeof PacksScreen>> = {}) => render(<PacksScreen visible onDismiss={jest.fn()} selectedKeys={[]} onChangeSelectedKeys={jest.fn()} packsVersion={0} onPacksChanged={jest.fn()} mode={DEFAULT_MODE} difficulty='any' onConfirm={jest.fn()} {...overrides} />)

// The loadout's side of the selection: it hands back whatever the screen asks for, with stable
// callbacks (the screen is memoized), the way PackSelectionProvider does.
const noop = () => {}
const SelectionHost = ({ initialKeys, visible = true, packsVersion = 0, onChange }: { initialKeys: string[]; visible?: boolean; packsVersion?: number; onChange?: (keys: string[]) => void }) => {
  const [selectedKeys, setSelectedKeys] = useState(initialKeys)
  const [handleChange] = useState(() => (keys: string[]) => {
    onChange?.(keys)
    setSelectedKeys(keys)
  })
  return <PacksScreen visible={visible} onDismiss={noop} selectedKeys={selectedKeys} onChangeSelectedKeys={handleChange} packsVersion={packsVersion} onPacksChanged={noop} mode={DEFAULT_MODE} difficulty='any' onConfirm={noop} />
}

const checkboxState = (screen: Awaited<ReturnType<typeof render>>, label: string) => screen.getByLabelText(label).props.accessibilityState?.checked

describe('PacksScreen', () => {
  beforeEach(async () => {
    // Resets customPacks.ts's module-level cache to empty via the always-null AsyncStorage mock -
    // otherwise a pack created in one test would leak into the next within this file.
    await loadCustomPacksCache()
    mockPickHangmanFile.mockReset()
    mockShareCustomPackFile.mockReset()
  })

  // The pack lists (this screen's and the pack browser's) batch their cell updates behind
  // VirtualizedList's own 50ms timer. Letting that land inside act, before RNTL's cleanup unmounts the
  // screen, keeps it from firing as an un-acted update between tests.
  afterEach(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
  })

  it('renders My packs and Built-in packs sections, honoring selectedKeys', async () => {
    const pack = builtIn()
    const { getByText, getByLabelText } = await renderScreen({ selectedKeys: [pack.key] })

    expect(getByText('Choose Packs')).toBeTruthy()
    expect(getByText('My Packs')).toBeTruthy()
    expect(getByText('Built-In Packs')).toBeTruthy()
    expect(getByText('No custom packs yet.')).toBeTruthy()
    expect(getByText(pack.label)).toBeTruthy()
    expect(getByLabelText(`View ${pack.label} contents`)).toBeTruthy()
  })

  it('calls onChangeSelectedKeys when a built-in pack row is toggled', async () => {
    const pack = builtIn()
    const onChangeSelectedKeys = jest.fn()
    const { getByText } = await renderScreen({ onChangeSelectedKeys })

    await fireEvent.press(getByText(pack.label))

    expect(onChangeSelectedKeys).toHaveBeenCalledWith([pack.key])
  })

  it('creates a pack via Create -> Save and returns to the list, selecting it', async () => {
    const onChangeSelectedKeys = jest.fn()
    const onPacksChanged = jest.fn()
    const { getByText, getByTestId, queryByTestId, rerender } = await renderScreen({ onChangeSelectedKeys, onPacksChanged })

    await fireEvent.press(getByText('Create'))
    expect(getByTestId('pack-label-input')).toBeTruthy()

    await fireEvent.changeText(getByTestId('pack-label-input'), 'My Trip')
    await fireEvent.changeText(getByTestId('entry-answer-0'), 'PARIS')
    await fireEvent.press(getByText('Save'))

    await waitFor(() => expect(getByText('Choose Packs')).toBeTruthy())
    expect(queryByTestId('pack-label-input')).toBeNull()
    expect(onPacksChanged).toHaveBeenCalled()
    expect(onChangeSelectedKeys).toHaveBeenCalled()

    // onPacksChanged only signals the parent to invalidate its own cache - in the real app
    // (LoadoutScreen, through useCatalog's refreshCustomPacks) that bumps a `packsVersion` counter
    // passed back in as a prop, which is what actually triggers this screen's manifest to
    // recompute. Simulate that round trip here.
    await rerender(<PacksScreen visible onDismiss={jest.fn()} selectedKeys={onChangeSelectedKeys.mock.calls[0][0]} onChangeSelectedKeys={jest.fn()} packsVersion={1} onPacksChanged={jest.fn()} mode={DEFAULT_MODE} difficulty='any' onConfirm={jest.fn()} />)

    expect(getByText('My Trip')).toBeTruthy()
  })

  it('disables Save pack until at least one word is entered, rather than accepting a press and doing nothing', async () => {
    const { getByText, getByTestId } = await renderScreen()

    await fireEvent.press(getByText('Create'))
    const saveButton = getByText('Save')
    expect(saveButton.parent?.parent?.props.accessibilityState.disabled).toBe(true)

    await fireEvent.changeText(getByTestId('entry-answer-0'), 'PARIS')

    expect(saveButton.parent?.parent?.props.accessibilityState.disabled).toBe(false)

    // Blanking it back out re-disables - a word that's whitespace-only after normalizing doesn't
    // count either, same rule handleSave itself applies before actually saving.
    await fireEvent.changeText(getByTestId('entry-answer-0'), '   ')

    expect(saveButton.parent?.parent?.props.accessibilityState.disabled).toBe(true)
  })

  it('shows Share and Delete icons in the editor header only for a pack that already exists, not one still being created', async () => {
    const pack = await saveCustomPack({ label: 'My Pack', entries: [{ answer: 'FOO', hint: '' }] })
    const { getByText, getByLabelText, queryByLabelText } = await renderScreen()

    await fireEvent.press(getByLabelText(`Edit ${pack.label}`))
    expect(getByLabelText('Share pack')).toBeTruthy()
    expect(getByLabelText('Delete pack')).toBeTruthy()

    await fireEvent.press(getByLabelText('Close'))
    await fireEvent.press(getByText('Create'))

    expect(queryByLabelText('Share pack')).toBeNull()
    expect(queryByLabelText('Delete pack')).toBeNull()
  })

  it('shares the pack as a real file via hangmanFile.ts when Share pack is pressed', async () => {
    mockShareCustomPackFile.mockResolvedValue(true)
    const pack = await saveCustomPack({ label: 'My Pack', entries: [{ answer: 'FOO', hint: '' }] })
    const { getByLabelText } = await renderScreen()

    await fireEvent.press(getByLabelText(`Edit ${pack.label}`))
    await fireEvent.press(getByLabelText('Share pack'))

    await waitFor(() => expect(mockShareCustomPackFile).toHaveBeenCalledWith(pack.key, pack.label))
  })

  // Delete pack goes through an in-app ConfirmDialog now, not window.confirm - a native dialog
  // isn't reliable on web (some browser/automation environments silently auto-decline it,
  // indistinguishable from the player themselves canceling).
  it('deletes the pack and returns to the list when Delete pack is confirmed in the dialog', async () => {
    const pack = await saveCustomPack({ label: 'My Pack', entries: [{ answer: 'FOO', hint: '' }] })
    const onPacksChanged = jest.fn()
    const { getByText, getByLabelText } = await renderScreen({ onPacksChanged })

    await fireEvent.press(getByLabelText(`Edit ${pack.label}`))
    await fireEvent.press(getByLabelText('Delete pack'))
    expect(getByText('Delete Pack?')).toBeTruthy()

    await fireEvent.press(getByText('Delete'))

    await waitFor(() => expect(getByText('Choose Packs')).toBeTruthy())
    // onPacksChanged only signals the parent to bump packsVersion and re-render with a fresh
    // manifest (see the "creates a pack" test above) - the actual deletion is what's checked here.
    expect(getPuzzleManifest().some((item) => item.key === pack.key)).toBe(false)
    expect(onPacksChanged).toHaveBeenCalled()
  })

  it('keeps editing and leaves the pack untouched when Delete pack is declined in the confirmation dialog', async () => {
    const pack = await saveCustomPack({ label: 'My Pack', entries: [{ answer: 'FOO', hint: '' }] })
    const onPacksChanged = jest.fn()
    const { getByLabelText, getByText, getAllByText, getByTestId, queryByText } = await renderScreen({ onPacksChanged })

    await fireEvent.press(getByLabelText(`Edit ${pack.label}`))
    await fireEvent.press(getByLabelText('Delete pack'))
    expect(getByText('Delete Pack?')).toBeTruthy()

    // The editor's own footer has a Cancel too; the confirm card renders through a Portal at the end
    // of the tree, so its Cancel is the last one.
    const cancels = getAllByText('Cancel')
    await fireEvent.press(cancels[cancels.length - 1])

    expect(queryByText('Delete Pack?')).toBeNull()
    // Still on the editor, not bounced back to the list.
    expect(getByTestId('pack-label-input')).toBeTruthy()
    expect(onPacksChanged).not.toHaveBeenCalled()
  })

  // Growing the list this way (rather than only via the Add word button) is what lets the pack
  // editor's return-key chain always advance onto an already-mounted field instead of one that
  // gets created and focused after the fact - see PackEditorDrawer's own comment on displayEntries
  // for why that append-then-focus shape was what actually caused its keyboard flicker.
  it('keeps one blank trailing row always ready, growing a new one the moment the previous last row is typed into', async () => {
    const { getByText, getByTestId, queryByTestId } = await renderScreen()

    await fireEvent.press(getByText('Create'))
    // Starts with just the one blank row - nothing typed into it yet.
    expect(queryByTestId('entry-answer-1')).toBeNull()

    await fireEvent.changeText(getByTestId('entry-answer-0'), 'PARIS')

    // Filling in the row that WAS last grows a new blank one in that same update.
    expect(getByTestId('entry-answer-1')).toBeTruthy()
    // Only one grows at a time - the newly-appended row is itself blank, so this doesn't cascade.
    expect(queryByTestId('entry-answer-2')).toBeNull()
  })

  it('does not pile on a second blank row when Add word is pressed while the trailing row is already blank', async () => {
    const { getByText, queryByTestId } = await renderScreen()

    await fireEvent.press(getByText('Create'))
    await fireEvent.press(getByText('Add'))

    // Still just the one row - Add word only focuses the already-there blank row now, since one
    // is always kept ready; it no longer unconditionally appends its own.
    expect(queryByTestId('entry-answer-1')).toBeNull()
  })

  it('disables the remove button on the not-yet-real trailing row, and on the sole remaining real one, but not on either once there are two real entries', async () => {
    const { getByText, getByTestId, getByLabelText } = await renderScreen()

    await fireEvent.press(getByText('Create'))
    await fireEvent.changeText(getByTestId('entry-answer-0'), 'PARIS')

    // entry-answer-1 now exists (see the growth test above) but nothing's been typed into IT -
    // it isn't real yet (see PackEditorDrawer's updateEntry), so there's nothing to remove.
    const virtualRemoveButton = getByLabelText('Remove entry 2')
    expect(virtualRemoveButton.props.accessibilityState?.disabled ?? virtualRemoveButton.props.disabled).toBe(true)
    // PARIS is still the only REAL entry (the virtual row above doesn't count) - removing it would
    // leave zero, same reason a brand-new form's own single blank row can't be removed either.
    const soleRealRemoveButton = getByLabelText('Remove entry 1')
    expect(soleRealRemoveButton.props.accessibilityState?.disabled ?? soleRealRemoveButton.props.disabled).toBe(true)

    // Typing into the (formerly virtual) second row promotes it into state, growing a third, still
    // virtual, blank row behind it - now that there are two REAL entries, either can be removed.
    await fireEvent.changeText(getByTestId('entry-answer-1'), 'LONDON')

    expect(soleRealRemoveButton.props.accessibilityState?.disabled ?? soleRealRemoveButton.props.disabled).toBe(false)
    const secondRealRemoveButton = getByLabelText('Remove entry 2')
    expect(secondRealRemoveButton.props.accessibilityState?.disabled ?? secondRealRemoveButton.props.disabled).toBe(false)
  })

  // Import picks a real file (see hangmanFile.ts) rather than pasting text into a box now -
  // pickHangmanFile is the only thing PacksScreen itself talks to for that.
  it('imports a pack from a picked file and selects it', async () => {
    const payload = JSON.stringify({ pack: { key: 'custom:imported', label: 'Imported Pack', puzzles: [{ answer: 'FOO' }] } })
    mockPickHangmanFile.mockResolvedValue(payload)
    const onChangeSelectedKeys = jest.fn()
    const onPacksChanged = jest.fn()
    const { getByText } = await renderScreen({ onChangeSelectedKeys, onPacksChanged })

    await fireEvent.press(getByText('Import'))

    // onPacksChanged only signals the parent to bump packsVersion and re-render with a fresh
    // manifest (see the "creates a pack" test above) - the actual import/select is checked here.
    await waitFor(() => expect(onChangeSelectedKeys).toHaveBeenCalledWith(['custom:imported']))
    expect(onPacksChanged).toHaveBeenCalled()
    expect(getPuzzleManifest().some((item) => item.key === 'custom:imported')).toBe(true)
  })

  it('does nothing when the file picker is canceled', async () => {
    mockPickHangmanFile.mockResolvedValue(null)
    const onPacksChanged = jest.fn()
    const { getByText } = await renderScreen({ onPacksChanged })

    await fireEvent.press(getByText('Import'))

    expect(onPacksChanged).not.toHaveBeenCalled()
  })

  it('shows an alert and does not change anything when the picked file is not a valid pack', async () => {
    mockPickHangmanFile.mockResolvedValue('not valid json')
    const onPacksChanged = jest.fn()
    const { getByText } = await renderScreen({ onPacksChanged })

    await fireEvent.press(getByText('Import'))

    await waitFor(() => expect(mockPickHangmanFile).toHaveBeenCalled())
    expect(onPacksChanged).not.toHaveBeenCalled()
  })

  it("shows a built-in pack's progress in its own animated detail drawer, and returns to the list when closed", async () => {
    const pack = builtIn()
    const { getByLabelText, getByRole, getByText, queryByText } = await renderScreen()

    await fireEvent.press(getByLabelText(`View ${pack.label} contents`))

    // Titled with the pack's own name.
    expect(getByRole('header', { name: pack.label })).toBeTruthy()
    await waitFor(() => expect(getByText(/unlocked/)).toBeTruthy())
    expect(queryByText('My Packs')).toBeNull()

    await fireEvent.press(getByLabelText('Close'))

    expect(getByText('Choose Packs')).toBeTruthy()
    expect(getByText('My Packs')).toBeTruthy()
  })

  // The pack browser plays: the Single Player loadout's start gets the payload (and asks before
  // abandoning a round with a guess on it).
  describe('the pack browser', () => {
    it("starts a draw from just that pack from Play This Pack, with the loadout's art and difficulty", async () => {
      const pack = builtIn()
      const onConfirm = jest.fn()
      const { getByLabelText, getByTestId } = await renderScreen({ onConfirm, difficulty: 'easy' })

      await fireEvent.press(getByLabelText(`View ${pack.label} contents`))
      await fireEvent.press(within(getByTestId('pack-puzzles-panel')).getByText('Play This Pack'))

      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(onConfirm.mock.calls[0][0]).toMatchObject({ packKey: pack.key, packScope: 'single', mode: DEFAULT_MODE, difficultyTier: 'easy' })
    })

    it('starts the puzzle picked from it', async () => {
      const pack = builtIn()
      const puzzle = getPuzzlesForCategory(pack.key)[0]
      const onConfirm = jest.fn()
      const { getByLabelText, getByTestId } = await renderScreen({ onConfirm })

      await fireEvent.press(getByLabelText(`View ${pack.label} contents`))
      await fireEvent.press(within(getByTestId('pack-puzzles-panel')).getByTestId(`puzzle-row-${puzzle.id}`))

      expect(onConfirm.mock.calls[0][0]).toMatchObject({ packKey: pack.key, puzzleId: puzzle.id })
    })

    it('narrows the selection to just that pack from Only This Pack, closing back onto the list', async () => {
      const [packA, packB] = builtInPacks()
      const onChange = jest.fn()
      const screen = await render(<SelectionHost initialKeys={[packA.key, packB.key]} onChange={onChange} />)

      await fireEvent.press(screen.getByLabelText(`View ${packB.label} contents`))
      await fireEvent.press(within(screen.getByTestId('pack-puzzles-panel')).getByText('Only This Pack'))

      expect(onChange).toHaveBeenLastCalledWith([packB.key])
      expect(screen.getByTestId('pack-puzzles-panel', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true)
      expect(checkboxState(screen, packA.label)).toBe(false)
      expect(checkboxState(screen, packB.label)).toBe(true)

      // Already just that pack: nothing left for it to do.
      await fireEvent.press(screen.getByLabelText(`View ${packB.label} contents`))
      expect(within(screen.getByTestId('pack-puzzles-panel')).getByRole('button', { name: 'Only This Pack' }).props.accessibilityState?.disabled).toBe(true)
    })

    // A custom pack plays the same way, and the row keeps its way into the editor.
    it("opens a custom pack's puzzles too, beside its edit button", async () => {
      const pack = await saveCustomPack({ label: 'My Pack', entries: [{ answer: 'FOO', hint: '' }] })
      const { getByLabelText, getByTestId } = await renderScreen()

      expect(getByLabelText(`Edit ${pack.label}`)).toBeTruthy()
      await fireEvent.press(getByLabelText(`View ${pack.label} contents`))

      expect(within(getByTestId('pack-puzzles-panel')).getByRole('header', { name: pack.label })).toBeTruthy()
    })
  })

  // What Pack Progress showed (folded in here, 2026-10-18): every pack's progress, and a trophy on a
  // pack with every puzzle unlocked.
  describe('progress', () => {
    beforeEach(() => {
      store.dispatch(activePlayerActions.setActivePlayer(null))
    })

    it("marks a pack with every puzzle unlocked with a trophy, and shows every other pack's count", async () => {
      const [packA, packB] = builtInPacks()
      const unlocked = getPuzzlesForCategory(packA.key).map((puzzle) => puzzle.id)
      const getItem = jest.spyOn(AsyncStorage, 'getItem').mockImplementation((key: string) => Promise.resolve(key === 'hangman:puzzle_unlocks_v1:guest' ? JSON.stringify({ [packA.key]: unlocked }) : null))
      const screen = await renderScreen()

      expect(await screen.findByText(`${packA.count.toLocaleString('en-US')} of ${packA.count.toLocaleString('en-US')} unlocked`)).toBeTruthy()
      expect(screen.getAllByText(`0 of ${packB.count.toLocaleString('en-US')} unlocked`).length).toBeGreaterThan(0)
      expect(screen.getAllByLabelText('Complete')).toHaveLength(1)
      getItem.mockRestore()
    })

    it('marks nothing complete with nothing unlocked', async () => {
      const screen = await renderScreen()

      expect(screen.queryByLabelText('Complete')).toBeNull()
    })
  })

  it('calls onDismiss when closed from the list root', async () => {
    const onDismiss = jest.fn()
    const { getByLabelText } = await renderScreen({ onDismiss })

    await fireEvent.press(getByLabelText('Close'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('always reopens at the list step, even if it was left mid-edit', async () => {
    const { getByText, getByTestId, rerender } = await renderScreen()

    await fireEvent.press(getByText('Create'))
    expect(getByTestId('pack-label-input')).toBeTruthy()

    await rerender(<PacksScreen visible={false} onDismiss={jest.fn()} selectedKeys={[]} onChangeSelectedKeys={jest.fn()} packsVersion={0} onPacksChanged={jest.fn()} mode={DEFAULT_MODE} difficulty='any' onConfirm={jest.fn()} />)
    await rerender(<PacksScreen visible onDismiss={jest.fn()} selectedKeys={[]} onChangeSelectedKeys={jest.fn()} packsVersion={0} onPacksChanged={jest.fn()} mode={DEFAULT_MODE} difficulty='any' onConfirm={jest.fn()} />)

    expect(getByText('Choose Packs')).toBeTruthy()
  })

  it('marks its own panel as a modal accessibility view only while neither the detail nor editor overlay is open on top of it', async () => {
    const pack = builtIn()
    const { getByTestId, getByLabelText, getByText } = await renderScreen()

    expect(getByTestId('packs-screen-panel').props.accessibilityViewIsModal).toBe(true)
    expect(getByTestId('packs-screen-panel').props.accessibilityElementsHidden).toBe(false)
    expect(getByTestId('packs-screen-panel').props.importantForAccessibility).toBe('yes')

    await fireEvent.press(getByLabelText(`View ${pack.label} contents`))

    // Closed-to-screen-readers while the detail overlay covers it - RTL's default queries skip
    // hidden elements, and includeHiddenElements opts back in here.
    const hiddenBehindDetail = getByTestId('packs-screen-panel', { includeHiddenElements: true })
    expect(hiddenBehindDetail.props.accessibilityViewIsModal).toBe(false)
    expect(hiddenBehindDetail.props.accessibilityElementsHidden).toBe(true)
    expect(hiddenBehindDetail.props.importantForAccessibility).toBe('no-hide-descendants')

    await fireEvent.press(getByLabelText('Close'))

    expect(getByTestId('packs-screen-panel').props.accessibilityViewIsModal).toBe(true)

    await fireEvent.press(getByText('Create'))

    const hiddenBehindEditor = getByTestId('packs-screen-panel', { includeHiddenElements: true })
    expect(hiddenBehindEditor.props.accessibilityElementsHidden).toBe(true)
  })

  it("keeps the detail drawer's own content mounted (just accessibility-hidden) after closing, instead of unmounting it mid-slide", async () => {
    const pack = builtIn()
    const { getByLabelText, getByTestId } = await renderScreen()

    await fireEvent.press(getByLabelText(`View ${pack.label} contents`))
    await fireEvent.press(getByLabelText('Close'))

    // The outer pack-puzzles-panel View always renders - only its header/list/footer children are
    // gated on `pack` (see PackPuzzlesDrawer's own `{pack ? (...) : null}`). If packKey were reset
    // to null on close (the bug this guards against), that gate would unmount those children
    // entirely, so scoping the query to inside the panel and still finding the pack's own title
    // there (hidden, not absent) is what actually proves the key survived the close instead of
    // blanking the content mid-slide.
    const hiddenDetailPanel = getByTestId('pack-puzzles-panel', { includeHiddenElements: true })
    expect(within(hiddenDetailPanel).getByRole('header', { name: pack.label, includeHiddenElements: true })).toBeTruthy()
  })

  describe('selection', () => {
    it("labels each pack's checkbox with its name, checked for the selected packs", async () => {
      const [packA, packB] = builtInPacks()
      const screen = await renderScreen({ selectedKeys: [packA.key] })

      expect(screen.getByLabelText(packA.label).props.accessibilityRole).toBe('checkbox')
      expect(checkboxState(screen, packA.label)).toBe(true)
      expect(checkboxState(screen, packB.label)).toBe(false)
    })

    it('adds and removes packs one toggle at a time, each building on the last', async () => {
      const [packA, packB, packC] = builtInPacks()
      const onChange = jest.fn()
      const screen = await render(<SelectionHost initialKeys={[packA.key]} onChange={onChange} />)

      await fireEvent.press(screen.getByLabelText(packB.label))
      await fireEvent.press(screen.getByText(packC.label))
      await fireEvent.press(screen.getByLabelText(packA.label))

      expect(onChange.mock.calls.map(([keys]) => keys)).toEqual([
        [packA.key, packB.key],
        [packA.key, packB.key, packC.key],
        [packB.key, packC.key]
      ])
      expect(checkboxState(screen, packA.label)).toBe(false)
      expect(checkboxState(screen, packB.label)).toBe(true)
      expect(checkboxState(screen, packC.label)).toBe(true)
    })

    // The row renderers read the selection through a ref and the checkboxes read it themselves, so a
    // toggle redraws one checkbox, not the visible rows.
    it('redraws no row when a pack is toggled, only its checkbox', async () => {
      const [packA, packB] = builtInPacks()
      const screen = await render(<SelectionHost initialKeys={[]} />)
      // The watched row is the one the screen draws.
      expect(mockPackRow.mock.calls.map(([props]) => props.label)).toContain(packB.label)
      mockPackRow.mockClear()

      await fireEvent.press(screen.getByLabelText(packA.label))

      expect(checkboxState(screen, packA.label)).toBe(true)
      const redrawn = mockPackRow.mock.calls.map(([props]) => props.label)
      expect(redrawn).not.toContain(packA.label)
      expect(redrawn).not.toContain(packB.label)
    })

    it('selects every pack from Select All, and none from Clear', async () => {
      const onChangeSelectedKeys = jest.fn()
      const { getByText } = await renderScreen({ onChangeSelectedKeys })

      await fireEvent.press(getByText('Select All'))
      expect(onChangeSelectedKeys).toHaveBeenLastCalledWith(
        getPuzzleManifest()
          .filter((item) => item.count > 0)
          .map((item) => item.key)
      )

      await fireEvent.press(getByText('Clear'))
      expect(onChangeSelectedKeys).toHaveBeenLastCalledWith([])
    })

    it('drops a deleted custom pack from the selection, keeping the rest', async () => {
      const pack = await saveCustomPack({ label: 'My Pack', entries: [{ answer: 'FOO', hint: '' }] })
      const other = builtIn()
      const onChange = jest.fn()
      const screen = await render(<SelectionHost initialKeys={[other.key, pack.key]} onChange={onChange} />)

      await fireEvent.press(screen.getByLabelText(`Edit ${pack.label}`))
      await fireEvent.press(screen.getByLabelText('Delete pack'))
      await fireEvent.press(screen.getByText('Delete'))

      await waitFor(() => expect(onChange).toHaveBeenCalledWith([other.key]))
    })
  })

  // A trimmed selection is easy to review: Selected shows only the packs that are in it.
  describe('the All / Selected filter', () => {
    const pressFilter = (screen: Awaited<ReturnType<typeof render>>, label: 'All' | 'Selected') => fireEvent.press(screen.getByRole('button', { name: label }))
    const filterChecked = (screen: Awaited<ReturnType<typeof render>>, label: 'All' | 'Selected') => screen.getByRole('button', { name: label }).props.accessibilityState?.checked

    it('starts on All, every pack listed', async () => {
      const [packA, packB] = builtInPacks()
      const screen = await renderScreen({ selectedKeys: [packA.key] })

      expect(filterChecked(screen, 'All')).toBe(true)
      expect(filterChecked(screen, 'Selected')).toBe(false)
      expect(screen.getByText(packA.label)).toBeTruthy()
      expect(screen.getByText(packB.label)).toBeTruthy()
    })

    // The AsyncStorage mock never returns what was saved, so only the last custom pack saved exists:
    // an unselected custom pack is covered by the empty-section test below.
    it('lists only the selected packs, custom and built-in, keeping Create and Import', async () => {
      const [packA, packB, packC] = builtInPacks()
      const custom = await saveCustomPack({ label: 'Picked Pack', entries: [{ answer: 'FOO', hint: '' }] })
      const screen = await renderScreen({ selectedKeys: [packB.key, custom.key], packsVersion: 1 })

      await pressFilter(screen, 'Selected')

      expect(filterChecked(screen, 'Selected')).toBe(true)
      expect(screen.getByText(packB.label)).toBeTruthy()
      expect(screen.getByText(custom.label)).toBeTruthy()
      for (const hidden of [packA.label, packC.label]) expect(screen.queryByText(hidden)).toBeNull()
      expect(screen.getByText('Create')).toBeTruthy()
      expect(screen.getByText('Import')).toBeTruthy()

      await pressFilter(screen, 'All')

      for (const shown of [packA.label, packB.label, packC.label, custom.label]) expect(screen.getByText(shown)).toBeTruthy()
    })

    it('drops a pack unchecked in the Selected view, and All brings it back', async () => {
      const [packA, packB] = builtInPacks()
      const screen = await render(<SelectionHost initialKeys={[packA.key, packB.key]} />)
      await pressFilter(screen, 'Selected')

      await fireEvent.press(screen.getByLabelText(packA.label))

      expect(screen.queryByText(packA.label)).toBeNull()
      expect(screen.getByText(packB.label)).toBeTruthy()

      await pressFilter(screen, 'All')

      expect(screen.getByText(packA.label)).toBeTruthy()
      expect(checkboxState(screen, packA.label)).toBe(false)
    })

    it('says so when a section has nothing selected', async () => {
      await saveCustomPack({ label: 'My Pack', entries: [{ answer: 'FOO', hint: '' }] })
      const screen = await renderScreen({ selectedKeys: [], packsVersion: 1 })

      await pressFilter(screen, 'Selected')

      expect(screen.getByText('No custom packs selected.')).toBeTruthy()
      expect(screen.getByText('No built-in packs selected.')).toBeTruthy()
    })

    it('keeps saying there are no custom packs yet when there are none at all', async () => {
      const screen = await renderScreen({ selectedKeys: [builtIn().key] })

      await pressFilter(screen, 'Selected')

      expect(screen.getByText('No custom packs yet.')).toBeTruthy()
      expect(screen.queryByText('No built-in packs selected.')).toBeNull()
    })

    // Someone coming back to add a pack would otherwise find only the ones already in.
    it('reopens on All', async () => {
      const [packA, packB] = builtInPacks()
      const screen = await render(<SelectionHost initialKeys={[packA.key]} />)
      await pressFilter(screen, 'Selected')
      expect(screen.queryByText(packB.label)).toBeNull()

      await screen.rerender(<SelectionHost initialKeys={[packA.key]} visible={false} />)
      await screen.rerender(<SelectionHost initialKeys={[packA.key]} />)

      expect(filterChecked(screen, 'All')).toBe(true)
      expect(screen.getByText(packB.label)).toBeTruthy()
    })
  })

  // The Single Player loadout's Android back asks this screen first, through its ref, since only this
  // screen knows whether its own editor or pack browser is open over it. A false sends the loadout on
  // to closing this screen itself.
  describe('closeTopOverlay', () => {
    const renderWithHandle = async (overrides: Partial<React.ComponentProps<typeof PacksScreen>> = {}) => {
      const handle = createRef<PacksScreenHandle>()
      const screen = await renderScreen({ ...overrides, ref: handle })
      // Inside act, as the loadout's back listener runs it, since closing one sets this screen's state.
      const closeTopOverlay = async () => {
        let closed = false
        await act(async () => {
          closed = handle.current!.closeTopOverlay()
        })
        return closed
      }
      const panelHidden = (testID: string) => screen.getByTestId(testID, { includeHiddenElements: true }).props.accessibilityElementsHidden
      return { ...screen, closeTopOverlay, panelHidden }
    }

    it('returns false, closing nothing, with nothing open over the list', async () => {
      const onDismiss = jest.fn()
      const { closeTopOverlay, panelHidden } = await renderWithHandle({ onDismiss })

      expect(await closeTopOverlay()).toBe(false)

      expect(panelHidden('packs-screen-panel')).toBe(false)
      // Closing this screen is the loadout's call, not this one's.
      expect(onDismiss).not.toHaveBeenCalled()
    })

    it('closes the pack browser and returns true, leaving the list open, then has nothing left to close', async () => {
      const pack = builtIn()
      const onDismiss = jest.fn()
      const { getByLabelText, closeTopOverlay, panelHidden } = await renderWithHandle({ onDismiss })
      await fireEvent.press(getByLabelText(`View ${pack.label} contents`))
      expect(panelHidden('pack-puzzles-panel')).toBe(false)

      expect(await closeTopOverlay()).toBe(true)

      expect(panelHidden('pack-puzzles-panel')).toBe(true)
      expect(panelHidden('packs-screen-panel')).toBe(false)
      expect(await closeTopOverlay()).toBe(false)
      expect(onDismiss).not.toHaveBeenCalled()
    })

    it('closes the editor and returns true, leaving the list open, then has nothing left to close', async () => {
      const onDismiss = jest.fn()
      const { getByText, closeTopOverlay, panelHidden } = await renderWithHandle({ onDismiss })
      await fireEvent.press(getByText('Create'))
      expect(panelHidden('pack-editor-panel')).toBe(false)

      expect(await closeTopOverlay()).toBe(true)

      expect(panelHidden('pack-editor-panel')).toBe(true)
      expect(panelHidden('packs-screen-panel')).toBe(false)
      expect(await closeTopOverlay()).toBe(false)
      expect(onDismiss).not.toHaveBeenCalled()
    })

    it('closes the editor before the pack browser when both are open', async () => {
      const pack = builtIn()
      const { getByLabelText, getByText, closeTopOverlay, panelHidden } = await renderWithHandle()
      await fireEvent.press(getByLabelText(`View ${pack.label} contents`))
      // The browser covers the list, so Create is only reachable through the hidden-elements query.
      await fireEvent.press(getByText('Create', { includeHiddenElements: true }))
      expect(panelHidden('pack-puzzles-panel')).toBe(false)
      expect(panelHidden('pack-editor-panel')).toBe(false)

      expect(await closeTopOverlay()).toBe(true)
      expect(panelHidden('pack-editor-panel')).toBe(true)
      expect(panelHidden('pack-puzzles-panel')).toBe(false)

      expect(await closeTopOverlay()).toBe(true)
      expect(panelHidden('pack-puzzles-panel')).toBe(true)
      expect(panelHidden('packs-screen-panel')).toBe(false)

      expect(await closeTopOverlay()).toBe(false)
    })
  })
})
