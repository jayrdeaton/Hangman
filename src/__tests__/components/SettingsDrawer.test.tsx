import { Provider } from '@rific/auto-paper'
import { HapticPressProvider } from '@rific/haptic-press'
import { fireEvent, render as rtlRender } from '@testing-library/react-native'
import type { ReactElement } from 'react'

import { SettingsDrawer } from '@/components/SettingsDrawer'
import { KeyboardLayoutContext, type KeyboardLayoutContextType } from '@/hooks/useKeyboardLayout'

// Same reasoning PuzzleDrawer.test.tsx's own renderDrawerWithRealTheme gives — @rific/auto-paper's
// AppearancePicker/PalettePicker need a real Provider to have anything to read/write, and
// HapticPressProvider is what actually backs the vibrate switch's own state (its context default
// with no Provider is a no-op setter, which the toggle test below needs to be real).
const render = (ui: ReactElement, keyboardLayout?: Partial<KeyboardLayoutContextType>) => {
  const wrapped = (
    <Provider initialValue={{ appearance: 'light' }}>
      <HapticPressProvider>{ui}</HapticPressProvider>
    </Provider>
  )
  if (!keyboardLayout) return rtlRender(wrapped)
  return rtlRender(<KeyboardLayoutContext.Provider value={{ layout: 'qwerty', setLayout: jest.fn(), ...keyboardLayout }}>{wrapped}</KeyboardLayoutContext.Provider>)
}

describe('SettingsDrawer', () => {
  it('shows Appearance, Keyboard layout, and Haptics sections — the controls PuzzleDrawer used to show directly', async () => {
    const { getByText, getByLabelText } = await render(<SettingsDrawer visible onDismiss={jest.fn()} />)

    expect(getByText('Appearance')).toBeTruthy()
    // Icon-only (showLabels={false}) — "System" truncates as visible text at this width, so the
    // accessible name is what's asserted on instead of the (intentionally hidden) label.
    expect(getByLabelText('System')).toBeTruthy()
    expect(getByLabelText('Light')).toBeTruthy()
    expect(getByLabelText('Dark')).toBeTruthy()

    expect(getByText('Keyboard layout')).toBeTruthy()
    expect(getByText('QWERTY')).toBeTruthy()
    expect(getByText('ABC')).toBeTruthy()

    expect(getByText('Haptics')).toBeTruthy()
    expect(getByLabelText('Vibrate on tap')).toBeTruthy()
  })

  it('switches the keyboard layout via the KeyboardLayout context when ABC is picked', async () => {
    const setLayout = jest.fn()
    const { getByText } = await render(<SettingsDrawer visible onDismiss={jest.fn()} />, { layout: 'qwerty', setLayout })

    await fireEvent.press(getByText('ABC'))

    expect(setLayout).toHaveBeenCalledWith('abc')
  })

  it('toggles haptic feedback via the switch, on by default', async () => {
    const { getByLabelText } = await render(<SettingsDrawer visible onDismiss={jest.fn()} />)

    const toggle = getByLabelText('Vibrate on tap')
    expect(toggle.props.value).toBe(true)

    await fireEvent(toggle, 'valueChange', false)

    expect(getByLabelText('Vibrate on tap').props.value).toBe(false)
  })

  it('only marks its own panel as a modal accessibility view while visible', async () => {
    const { getByTestId, rerender } = await render(<SettingsDrawer visible onDismiss={jest.fn()} />)

    expect(getByTestId('settings-drawer-panel').props.accessibilityViewIsModal).toBe(true)
    expect(getByTestId('settings-drawer-panel').props.accessibilityElementsHidden).toBe(false)

    await rerender(
      <Provider initialValue={{ appearance: 'light' }}>
        <HapticPressProvider>
          <SettingsDrawer visible={false} onDismiss={jest.fn()} />
        </HapticPressProvider>
      </Provider>
    )

    const closedPanel = getByTestId('settings-drawer-panel', { includeHiddenElements: true })
    expect(closedPanel.props.accessibilityViewIsModal).toBe(false)
    expect(closedPanel.props.accessibilityElementsHidden).toBe(true)
  })

  it('closes when the header back action is pressed', async () => {
    const onDismiss = jest.fn()
    const { getByLabelText } = await render(<SettingsDrawer visible onDismiss={onDismiss} />)

    await fireEvent.press(getByLabelText('Close'))

    expect(onDismiss).toHaveBeenCalled()
  })
})
