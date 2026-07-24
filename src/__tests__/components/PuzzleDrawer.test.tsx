import { fireEvent, render } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'

import { PuzzleDrawer } from '@/components/PuzzleDrawer'
import { DEFAULT_MODE } from '@/modes/registry'
import type { PuzzleConfig } from '@/utils/puzzlePicker'

jest.mock('@/utils/alert', () => ({
  alert: jest.fn().mockResolvedValue(undefined),
  confirm: jest.fn().mockResolvedValue(true)
}))

const baseConfig: PuzzleConfig = {
  sourceMode: 'random',
  difficulty: 'any',
  packKeys: [],
  mode: DEFAULT_MODE,
  customPhrase: '',
  customHint: ''
}

const renderDrawer = (overrides: Partial<React.ComponentProps<typeof PuzzleDrawer>> = {}) => render(<PuzzleDrawer visible onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} {...overrides} />)

describe('PuzzleDrawer', () => {
  let announceSpy: jest.SpiedFunction<typeof AccessibilityInfo.announceForAccessibility>

  beforeEach(() => {
    announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
  })

  afterEach(() => {
    announceSpy.mockRestore()
  })

  it('shows Choose packs and Difficulty together, and hides the custom form, for the default Random source', async () => {
    const { getByText, queryByTestId } = await renderDrawer()

    expect(getByText('Choose packs')).toBeTruthy()
    expect(getByText('Difficulty')).toBeTruthy()
    expect(queryByTestId('phrase-input')).toBeNull()
  })

  it('hides Choose packs and Difficulty for Custom', async () => {
    const { getByText, queryByText } = await renderDrawer()

    await fireEvent.press(getByText('Custom'))

    expect(queryByText('Choose packs')).toBeNull()
    expect(queryByText('Difficulty')).toBeNull()
  })

  it('shows the secret-word and hint fields (not Difficulty) for Custom, revealed by default', async () => {
    const { getByText, getByTestId, getByLabelText, queryByText } = await renderDrawer()

    await fireEvent.press(getByText('Custom'))

    expect(getByTestId('phrase-input')).toBeTruthy()
    expect(getByTestId('hint-input')).toBeTruthy()
    expect(queryByText('Difficulty')).toBeNull()
    expect(getByLabelText('Hide secret word')).toBeTruthy()
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

  it('labels the confirm button "Start this puzzle" for Custom and "New puzzle" otherwise', async () => {
    const { getByText } = await renderDrawer()

    expect(getByText('New puzzle')).toBeTruthy()

    await fireEvent.press(getByText('Custom'))

    expect(getByText('Start this puzzle')).toBeTruthy()
  })

  it('calls onConfirm with the typed phrase and hint when confirming a custom puzzle', async () => {
    const onConfirm = jest.fn()
    const { getByText, getByTestId } = await renderDrawer({ onConfirm })

    await fireEvent.press(getByText('Custom'))
    await fireEvent.changeText(getByTestId('phrase-input'), 'CAT DOG')
    await fireEvent.changeText(getByTestId('hint-input'), 'Two pets')
    await fireEvent.press(getByText('Start this puzzle'))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const [payload, config] = onConfirm.mock.calls[0]
    expect(payload.phrase).toBe('CAT DOG')
    expect(payload.hint).toBe('Two pets')
    expect(config.sourceMode).toBe('custom')
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

  it('announces the newly shown section when Puzzle source changes, but not on first open', async () => {
    const { getByText } = await renderDrawer()

    expect(announceSpy).not.toHaveBeenCalled()

    await fireEvent.press(getByText('Custom'))

    expect(announceSpy).toHaveBeenCalledWith('Custom puzzle form shown')
  })

  it('does not announce when reopening discards an unconfirmed source-mode edit', async () => {
    const { getByText, rerender } = await renderDrawer()

    await fireEvent.press(getByText('Custom'))
    announceSpy.mockClear()

    await rerender(<PuzzleDrawer visible={false} onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} />)
    await rerender(<PuzzleDrawer visible onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} />)

    expect(announceSpy).not.toHaveBeenCalled()
  })
})
