import { fireEvent, render as rtlRender, waitFor, within } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { PaperProvider } from 'react-native-paper'

import { PacksScreen } from '@/components/PacksScreen'
import { loadCustomPacksCache, saveCustomPack } from '@/utils/customPacks'
import { pickHangmanFile, shareCustomPackFile } from '@/utils/hangmanFile'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'

// PacksScreen only ever talks to the real device/OS through this module (see its own doc
// comments for why: file pickers and share sheets aren't meaningfully unit-testable, and web's
// share path in particular depends on browser globals this test environment doesn't provide) — so
// the boundary mocked here is hangmanFile.ts itself, not expo-document-picker/expo-sharing
// underneath it. Those have their own dedicated coverage in hangmanFile.test.ts.
jest.mock('@/utils/hangmanFile', () => ({
  pickHangmanFile: jest.fn(),
  shareCustomPackFile: jest.fn()
}))

const mockPickHangmanFile = jest.mocked(pickHangmanFile)
const mockShareCustomPackFile = jest.mocked(shareCustomPackFile)

const builtIn = () => getPuzzleManifest().filter((item) => item.count > 0)[0]

// ConfirmDialog renders through a react-native-paper Portal (Delete pack's confirm dialog) — needs
// a Portal.Host ancestor, normally supplied by @rific/auto-paper's Provider at the app root; same
// wrapper AchievementsDrawer.test.tsx uses for its own Portal-based dialog.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: PaperProvider })

const renderScreen = (overrides: Partial<React.ComponentProps<typeof PacksScreen>> = {}) => render(<PacksScreen visible onDismiss={jest.fn()} selectedKeys={[]} onChangeSelectedKeys={jest.fn()} packsVersion={0} onPacksChanged={jest.fn()} {...overrides} />)

describe('PacksScreen', () => {
  beforeEach(async () => {
    // Resets customPacks.ts's module-level cache to empty via the always-null AsyncStorage mock —
    // otherwise a pack created in one test would leak into the next within this file.
    await loadCustomPacksCache()
    mockPickHangmanFile.mockReset()
    mockShareCustomPackFile.mockReset()
  })

  it('renders My packs and Built-in packs sections, honoring selectedKeys', async () => {
    const pack = builtIn()
    const { getByText, getByLabelText } = await renderScreen({ selectedKeys: [pack.key] })

    expect(getByText('Choose packs')).toBeTruthy()
    expect(getByText('My packs')).toBeTruthy()
    expect(getByText('Built-in packs')).toBeTruthy()
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
    await fireEvent.press(getByText('Save pack'))

    await waitFor(() => expect(getByText('Choose packs')).toBeTruthy())
    expect(queryByTestId('pack-label-input')).toBeNull()
    expect(onPacksChanged).toHaveBeenCalled()
    expect(onChangeSelectedKeys).toHaveBeenCalled()

    // onPacksChanged only signals the parent to invalidate its own cache — in the real app
    // (Main.tsx) that bumps a `packsVersion` counter passed back in as a prop, which is what
    // actually triggers this screen's manifest to recompute. Simulate that round trip here.
    await rerender(<PacksScreen visible onDismiss={jest.fn()} selectedKeys={onChangeSelectedKeys.mock.calls[0][0]} onChangeSelectedKeys={jest.fn()} packsVersion={1} onPacksChanged={jest.fn()} />)

    expect(getByText('My Trip')).toBeTruthy()
  })

  it('disables Save pack until at least one word is entered, rather than accepting a press and doing nothing', async () => {
    const { getByText, getByTestId } = await renderScreen()

    await fireEvent.press(getByText('Create'))
    const saveButton = getByText('Save pack')
    expect(saveButton.parent?.parent?.props.accessibilityState.disabled).toBe(true)

    await fireEvent.changeText(getByTestId('entry-answer-0'), 'PARIS')

    expect(saveButton.parent?.parent?.props.accessibilityState.disabled).toBe(false)

    // Blanking it back out re-disables — a word that's whitespace-only after normalizing doesn't
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

  // Delete pack goes through an in-app ConfirmDialog now, not window.confirm — a native dialog
  // isn't reliable on web (some browser/automation environments silently auto-decline it,
  // indistinguishable from the player themselves canceling).
  it('deletes the pack and returns to the list when Delete pack is confirmed in the dialog', async () => {
    const pack = await saveCustomPack({ label: 'My Pack', entries: [{ answer: 'FOO', hint: '' }] })
    const onPacksChanged = jest.fn()
    const { getByText, getByLabelText, getByTestId } = await renderScreen({ onPacksChanged })

    await fireEvent.press(getByLabelText(`Edit ${pack.label}`))
    await fireEvent.press(getByLabelText('Delete pack'))
    expect(getByText('Delete pack?')).toBeTruthy()

    await fireEvent.press(getByTestId('confirm-dialog-confirm'))

    await waitFor(() => expect(getByText('Choose packs')).toBeTruthy())
    // onPacksChanged only signals the parent to bump packsVersion and re-render with a fresh
    // manifest (see the "creates a pack" test above) — the actual deletion is what's checked here.
    expect(getPuzzleManifest().some((item) => item.key === pack.key)).toBe(false)
    expect(onPacksChanged).toHaveBeenCalled()
  })

  it('keeps editing and leaves the pack untouched when Delete pack is declined in the confirmation dialog', async () => {
    const pack = await saveCustomPack({ label: 'My Pack', entries: [{ answer: 'FOO', hint: '' }] })
    const onPacksChanged = jest.fn()
    const { getByLabelText, getByText, getByTestId, queryByText } = await renderScreen({ onPacksChanged })

    await fireEvent.press(getByLabelText(`Edit ${pack.label}`))
    await fireEvent.press(getByLabelText('Delete pack'))
    expect(getByText('Delete pack?')).toBeTruthy()

    await fireEvent.press(getByTestId('confirm-dialog-cancel'))

    expect(queryByText('Delete pack?')).toBeNull()
    // Still on the editor, not bounced back to the list.
    expect(getByTestId('pack-label-input')).toBeTruthy()
    expect(onPacksChanged).not.toHaveBeenCalled()
  })

  it('adds another entry row via the Add word button at the end of the list', async () => {
    const { getByText, getByTestId, queryByTestId } = await renderScreen()

    await fireEvent.press(getByText('Create'))
    expect(queryByTestId('entry-answer-1')).toBeNull()

    await fireEvent.press(getByText('Add word'))

    expect(getByTestId('entry-answer-1')).toBeTruthy()
  })

  // Import picks a real file (see hangmanFile.ts) rather than pasting text into a box now —
  // pickHangmanFile is the only thing PacksScreen itself talks to for that.
  it('imports a pack from a picked file and selects it', async () => {
    const payload = JSON.stringify({ pack: { key: 'custom:imported', label: 'Imported Pack', puzzles: [{ answer: 'FOO' }] } })
    mockPickHangmanFile.mockResolvedValue(payload)
    const onChangeSelectedKeys = jest.fn()
    const onPacksChanged = jest.fn()
    const { getByText } = await renderScreen({ onChangeSelectedKeys, onPacksChanged })

    await fireEvent.press(getByText('Import'))

    // onPacksChanged only signals the parent to bump packsVersion and re-render with a fresh
    // manifest (see the "creates a pack" test above) — the actual import/select is checked here.
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
    const { getByLabelText, getByText, queryByText } = await renderScreen()

    await fireEvent.press(getByLabelText(`View ${pack.label} contents`))

    expect(getByText(pack.label)).toBeTruthy()
    await waitFor(() => expect(getByText(/unlocked/)).toBeTruthy())
    expect(queryByText('My packs')).toBeNull()

    await fireEvent.press(getByLabelText('Close'))

    expect(getByText('Choose packs')).toBeTruthy()
    expect(getByText('My packs')).toBeTruthy()
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

    await rerender(<PacksScreen visible={false} onDismiss={jest.fn()} selectedKeys={[]} onChangeSelectedKeys={jest.fn()} packsVersion={0} onPacksChanged={jest.fn()} />)
    await rerender(<PacksScreen visible onDismiss={jest.fn()} selectedKeys={[]} onChangeSelectedKeys={jest.fn()} packsVersion={0} onPacksChanged={jest.fn()} />)

    expect(getByText('Choose packs')).toBeTruthy()
  })

  it('marks its own panel as a modal accessibility view only while neither the detail nor editor overlay is open on top of it', async () => {
    const pack = builtIn()
    const { getByTestId, getByLabelText, getByText } = await renderScreen()

    expect(getByTestId('packs-screen-panel').props.accessibilityViewIsModal).toBe(true)
    expect(getByTestId('packs-screen-panel').props.accessibilityElementsHidden).toBe(false)
    expect(getByTestId('packs-screen-panel').props.importantForAccessibility).toBe('yes')

    await fireEvent.press(getByLabelText(`View ${pack.label} contents`))

    // Closed-to-screen-readers while the detail overlay covers it — RTL's default queries skip
    // hidden elements (see PuzzleDrawer.test.tsx's own version of this same assertion),
    // includeHiddenElements opts back in here.
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

    // The outer pack-puzzles-panel View always renders — only its header/list/footer children are
    // gated on `pack` (see PackPuzzlesDrawer's own `{pack ? (...) : null}`). If packKey were reset
    // to null on close (the bug this guards against), that gate would unmount those children
    // entirely, so scoping the query to inside the panel and still finding the pack's own title
    // there (hidden, not absent) is what actually proves the key survived the close instead of
    // blanking the content mid-slide.
    const hiddenDetailPanel = getByTestId('pack-puzzles-panel', { includeHiddenElements: true })
    expect(within(hiddenDetailPanel).getByText(pack.label, { includeHiddenElements: true })).toBeTruthy()
  })
})
