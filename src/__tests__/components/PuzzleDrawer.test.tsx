import { fireEvent, render } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'

import { PuzzleDrawer } from '@/components/PuzzleDrawer'
import { DEFAULT_MODE } from '@/modes/registry'
import { addCustomPuzzle } from '@/utils/customPacks'
import type { PuzzleConfig } from '@/utils/puzzlePicker'

// Any mode other than DEFAULT_MODE (baseConfig.mode below) — used to prove a mode change was
// actually applied, not just re-confirmed as the same value.
const OTHER_MODE_ACCESSIBILITY_LABEL = /Letters Only mode/

// ModeSelector's cards render from a measured container width (see ModeSelector.test.tsx) — with
// no layout event, its FlatList never renders a single card and mode-card queries below would
// always come up empty.
const MODE_SELECTOR_LAYOUT_EVENT = { nativeEvent: { layout: { x: 0, y: 0, width: 380, height: 200 } } }

jest.mock('@/utils/alert', () => ({
  alert: jest.fn().mockResolvedValue(undefined),
  confirm: jest.fn().mockResolvedValue(true)
}))

// PuzzleDrawer also renders PacksScreen, which pulls in several other exports from this same
// module (isCustomPackKey, saveCustomPack, etc.) — spreading the real module keeps those working
// and only overrides the one export this file actually asserts on.
jest.mock('@/utils/customPacks', () => ({
  ...jest.requireActual('@/utils/customPacks'),
  addCustomPuzzle: jest.fn().mockResolvedValue({ key: 'custom:test', label: 'Custom', createdAt: '', updatedAt: '', puzzles: [] })
}))

const mockAddCustomPuzzle = jest.mocked(addCustomPuzzle)

const baseConfig: PuzzleConfig = {
  sourceMode: 'random',
  difficulty: 'any',
  mode: DEFAULT_MODE,
  customPhrase: '',
  customHint: ''
}

const renderDrawer = (overrides: Partial<React.ComponentProps<typeof PuzzleDrawer>> = {}) => render(<PuzzleDrawer visible onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} {...overrides} />)

describe('PuzzleDrawer', () => {
  let announceSpy: jest.SpiedFunction<typeof AccessibilityInfo.announceForAccessibility>

  beforeEach(() => {
    announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    mockAddCustomPuzzle.mockClear()
  })

  afterEach(() => {
    announceSpy.mockRestore()
  })

  it('shows Choose packs, Custom, and Difficulty together by default, with the custom form hidden', async () => {
    const { getByText, queryByTestId } = await renderDrawer()

    expect(getByText('No packs selected')).toBeTruthy()
    expect(getByText('Custom')).toBeTruthy()
    expect(getByText('Difficulty')).toBeTruthy()
    expect(queryByTestId('phrase-input')).toBeNull()
  })

  it('shows the custom form alongside Choose packs and Difficulty (not in place of either) when Custom is toggled on', async () => {
    const { getByText } = await renderDrawer()

    await fireEvent.press(getByText('Custom'))

    expect(getByText('No packs selected')).toBeTruthy()
    expect(getByText('Difficulty')).toBeTruthy()
  })

  it('leaves every Difficulty option unselected and the confirm button disabled while the custom word is still blank', async () => {
    const { getByText } = await renderDrawer()

    await fireEvent.press(getByText('Custom'))

    for (const label of ['Easy', 'Medium', 'Hard']) {
      expect(getByText(label).parent?.parent?.props.accessibilityState.checked).toBe(false)
    }
    expect(getByText('Start puzzle').parent?.parent?.props.accessibilityState.disabled).toBe(true)
  })

  it("reflects the typed word's own scored tier in the (now read-only) Difficulty picker, and enables the confirm button", async () => {
    const { getByText, getByTestId } = await renderDrawer()

    await fireEvent.press(getByText('Custom'))

    // Same low-letter-diversity-scores-hard example already covered for the underlying scorer in
    // customPacks.test.ts — this is checking the drawer wires that scorer up, not re-deriving it.
    await fireEvent.changeText(getByTestId('phrase-input'), 'cat')

    expect(getByText('Hard').parent?.parent?.props.accessibilityState.checked).toBe(true)
    expect(getByText('Easy').parent?.parent?.props.accessibilityState.checked).toBe(false)
    expect(getByText('Start puzzle').parent?.parent?.props.accessibilityState.disabled).toBe(false)
  })

  it('keeps every Difficulty option disabled (read-only) while the custom form is open', async () => {
    const { getByText, getByTestId } = await renderDrawer()

    await fireEvent.press(getByText('Custom'))
    await fireEvent.changeText(getByTestId('phrase-input'), 'cat')

    for (const label of ['Easy', 'Medium', 'Hard']) {
      expect(getByText(label).parent?.parent?.props.accessibilityState.disabled).toBe(true)
    }
  })

  it('shows the secret-word and hint fields for Custom, revealed by default', async () => {
    const { getByText, getByTestId, getByLabelText } = await renderDrawer()

    await fireEvent.press(getByText('Custom'))

    expect(getByTestId('phrase-input')).toBeTruthy()
    expect(getByTestId('hint-input')).toBeTruthy()
    expect(getByLabelText('Hide secret word')).toBeTruthy()
  })

  it('replaces the Custom button with Cancel once open, rather than un-pressing the same button', async () => {
    const { getByText, queryByTestId } = await renderDrawer()

    await fireEvent.press(getByText('Custom'))
    expect(queryByTestId('phrase-input')).toBeTruthy()

    // "Custom" is gone once open — replaced by "Cancel" — so there's no same-button un-press to
    // (mis)fire here even by accident.
    expect(() => getByText('Custom')).toThrow()
    expect(getByText('Cancel')).toBeTruthy()
  })

  it('closes the custom form and discards the typed word and hint when Cancel is pressed, leaving Difficulty as an editable filter again', async () => {
    const { getByText, getByTestId, queryByTestId } = await renderDrawer()

    await fireEvent.press(getByText('Custom'))
    await fireEvent.changeText(getByTestId('phrase-input'), 'PIZZA NIGHT')
    await fireEvent.changeText(getByTestId('hint-input'), 'Friday tradition')

    await fireEvent.press(getByText('Cancel'))

    expect(queryByTestId('phrase-input')).toBeNull()
    expect(getByText('Difficulty')).toBeTruthy()
    expect(getByText('Easy').parent?.parent?.props.accessibilityState.disabled).toBe(false)

    // Reopening confirms the draft was actually cleared, not just hidden.
    await fireEvent.press(getByText('Custom'))
    expect(getByTestId('phrase-input').props.value).toBe('')
    expect(getByTestId('hint-input').props.value).toBe('')
  })

  it('toggles the reveal label and hidden state when the eye icon is pressed', async () => {
    const { getByText, getByTestId, getByLabelText, queryByLabelText } = await renderDrawer()

    await fireEvent.press(getByText('Custom'))
    expect(getByTestId('phrase-input').props.secureTextEntry).toBe(false)

    await fireEvent.press(getByLabelText('Hide secret word'))

    expect(getByLabelText('Show secret word')).toBeTruthy()
    expect(queryByLabelText('Hide secret word')).toBeNull()
    expect(getByTestId('phrase-input').props.secureTextEntry).toBe(true)
  })

  it('labels the confirm button "Start puzzle" for Custom and "New puzzle" otherwise', async () => {
    const { getByText } = await renderDrawer()

    expect(getByText('New puzzle')).toBeTruthy()

    await fireEvent.press(getByText('Custom'))

    expect(getByText('Start puzzle')).toBeTruthy()
  })

  it('saves the typed word and hint to the Custom pack, and calls onConfirm, when confirming a custom puzzle', async () => {
    const onConfirm = jest.fn()
    const onPacksChanged = jest.fn()
    const { getByText, getByTestId } = await renderDrawer({ onConfirm, onPacksChanged })

    await fireEvent.press(getByText('Custom'))
    await fireEvent.changeText(getByTestId('phrase-input'), 'CAT DOG')
    await fireEvent.changeText(getByTestId('hint-input'), 'Two pets')
    await fireEvent.press(getByText('Start puzzle'))

    expect(mockAddCustomPuzzle).toHaveBeenCalledWith({ answer: 'CAT DOG', hint: 'Two pets' })
    expect(onPacksChanged).toHaveBeenCalledTimes(1)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const [payload, config] = onConfirm.mock.calls[0]
    expect(payload.phrase).toBe('CAT DOG')
    expect(payload.hint).toBe('Two pets')
    expect(config.sourceMode).toBe('custom')
  })

  it('does not save anything to the Custom pack when confirming a normal (non-custom) puzzle', async () => {
    // usePackSelection has no Provider here, so it falls back to its default empty selection —
    // resolving fails ("Choose at least one pack") and onConfirm never fires either way. That's
    // fine: this test only cares that the custom-pack save is gated on customFormOpen, not on
    // whether the (unrelated) random draw itself succeeds.
    const { getByText } = await renderDrawer()

    await fireEvent.press(getByText('New puzzle'))

    expect(mockAddCustomPuzzle).not.toHaveBeenCalled()
  })

  it('does not reset user edits on an unrelated rerender when initialConfig stays referentially the same', async () => {
    const { getByText, getByTestId, rerender } = await renderDrawer()

    await fireEvent.press(getByText('Custom'))
    await fireEvent.changeText(getByTestId('phrase-input'), 'HELLO')

    await rerender(<PuzzleDrawer visible onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} />)

    expect(getByTestId('phrase-input').props.value).toBe('HELLO')
  })

  it('re-syncs the draft when initialConfig changes while the drawer is already open (a fresh shared link arriving)', async () => {
    const customA: PuzzleConfig = { ...baseConfig, sourceMode: 'custom', customPhrase: 'FIRST' }
    const customB: PuzzleConfig = { ...baseConfig, sourceMode: 'custom', customPhrase: 'SECOND' }
    const { getByTestId, rerender } = await renderDrawer({ initialConfig: customA })

    expect(getByTestId('phrase-input').props.value).toBe('FIRST')

    await rerender(<PuzzleDrawer visible onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={customB} onConfirm={jest.fn()} />)

    expect(getByTestId('phrase-input').props.value).toBe('SECOND')
  })

  it('opens straight into the custom form when initialConfig carries a shared custom puzzle', async () => {
    const shared: PuzzleConfig = { ...baseConfig, sourceMode: 'custom', customPhrase: 'SHARED' }
    const { getByTestId } = await renderDrawer({ initialConfig: shared })

    expect(getByTestId('phrase-input').props.value).toBe('SHARED')
  })

  it('resets the secret word back to revealed each time the drawer reopens, even if the user had hidden it', async () => {
    const { getByText, getByLabelText, rerender } = await renderDrawer()

    await fireEvent.press(getByText('Custom'))
    await fireEvent.press(getByLabelText('Hide secret word'))
    expect(getByLabelText('Show secret word')).toBeTruthy()

    await rerender(<PuzzleDrawer visible={false} onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} />)
    await rerender(<PuzzleDrawer visible onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} />)
    await fireEvent.press(getByText('Custom'))

    expect(getByLabelText('Hide secret word')).toBeTruthy()
  })

  it('only marks the drawer as a modal accessibility view while visible', async () => {
    const { getByTestId, rerender } = await renderDrawer()

    expect(getByTestId('puzzle-drawer-panel').props.accessibilityViewIsModal).toBe(true)
    expect(getByTestId('puzzle-drawer-panel').props.accessibilityElementsHidden).toBe(false)
    expect(getByTestId('puzzle-drawer-panel').props.importantForAccessibility).toBe('yes')

    await rerender(<PuzzleDrawer visible={false} onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} />)

    // Closed state is deliberately hidden from accessibility tools (accessibilityElementsHidden),
    // so RTL's default queries skip it — includeHiddenElements opts back in for this assertion.
    const closedPanel = getByTestId('puzzle-drawer-panel', { includeHiddenElements: true })
    expect(closedPanel.props.accessibilityViewIsModal).toBe(false)
    expect(closedPanel.props.accessibilityElementsHidden).toBe(true)
    expect(closedPanel.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('announces the newly shown section when the Custom toggle changes, but not on first open', async () => {
    const { getByText } = await renderDrawer()

    expect(announceSpy).not.toHaveBeenCalled()

    await fireEvent.press(getByText('Custom'))

    expect(announceSpy).toHaveBeenCalledWith('Custom puzzle form shown')
  })

  it('does not announce when reopening discards an unconfirmed Custom-toggle edit', async () => {
    const { getByText, rerender } = await renderDrawer()

    await fireEvent.press(getByText('Custom'))
    announceSpy.mockClear()

    await rerender(<PuzzleDrawer visible={false} onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} />)
    await rerender(<PuzzleDrawer visible onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} />)

    expect(announceSpy).not.toHaveBeenCalled()
  })

  it('fires onModeChange immediately when a different mode card is tapped, without requiring confirm', async () => {
    const onModeChange = jest.fn()
    const onConfirm = jest.fn()
    const { getByLabelText, getByTestId } = await renderDrawer({ onModeChange, onConfirm })

    await fireEvent(getByTestId('mode-selector-container'), 'layout', MODE_SELECTOR_LAYOUT_EVENT)
    await fireEvent.press(getByLabelText(OTHER_MODE_ACCESSIBILITY_LABEL))

    expect(onModeChange).toHaveBeenCalledTimes(1)
    expect(onModeChange.mock.calls[0][0].id).toBe('letters')
    // The art style is meant to apply to whatever's already playing right away — Main.tsx's
    // handleModeChange is what actually pushes it live, but from the drawer's own side this
    // shouldn't wait on (or require) the confirm button at all.
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('fires onDifficultyChange immediately when a difficulty option is picked, without requiring confirm', async () => {
    const onDifficultyChange = jest.fn()
    const onConfirm = jest.fn()
    const { getByText } = await renderDrawer({ onDifficultyChange, onConfirm })

    await fireEvent.press(getByText('Hard'))

    expect(onDifficultyChange).toHaveBeenCalledWith('hard')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('does not fire onDifficultyChange from the read-only Difficulty reflection while the custom form is open', async () => {
    const onDifficultyChange = jest.fn()
    const { getByText, getByTestId } = await renderDrawer({ onDifficultyChange })

    await fireEvent.press(getByText('Custom'))
    await fireEvent.changeText(getByTestId('phrase-input'), 'cat')
    // "Hard" is the tier a low-letter-diversity word like "cat" scores as (see customPacks.test.ts)
    // — pressing it here is pressing the read-only reflection, not a real filter.
    await fireEvent.press(getByText('Hard'))

    expect(onDifficultyChange).not.toHaveBeenCalled()
  })

  it('keeps an unsaved custom word draft intact when a live mode change echoes back through initialConfig', async () => {
    const onModeChange = jest.fn()
    const { getByText, getByTestId, getByLabelText, rerender } = await renderDrawer({ onModeChange })

    await fireEvent.press(getByText('Custom'))
    await fireEvent.changeText(getByTestId('phrase-input'), 'PIZZA NIGHT')

    await fireEvent(getByTestId('mode-selector-container'), 'layout', MODE_SELECTOR_LAYOUT_EVENT)
    await fireEvent.press(getByLabelText(OTHER_MODE_ACCESSIBILITY_LABEL))
    const newMode = onModeChange.mock.calls[0][0]

    // Simulates Main.tsx's handleModeChange writing the new mode into config, which flows back
    // down here as a changed initialConfig while the drawer is still open — this must NOT reset
    // the draft (see the drawer's narrowed resync effect), or picking a new art style mid-typing
    // would silently erase whatever custom word the player hadn't confirmed yet.
    await rerender(<PuzzleDrawer visible onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={{ ...baseConfig, mode: newMode }} onConfirm={jest.fn()} onModeChange={onModeChange} />)

    expect(getByTestId('phrase-input').props.value).toBe('PIZZA NIGHT')
  })
})
