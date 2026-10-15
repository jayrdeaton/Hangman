import { Provider } from '@rific/auto-paper'
import { FeedbackPressProvider } from '@rific/feedback-press'
import { ToastProvider } from '@rific/toaster'
import { fireEvent, render as rtlRender } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import * as RNPaper from 'react-native-paper'

import { SettingsDialog } from '@/components/SettingsDialog'
import { release } from '@/constants/release'
import { KeyboardLayoutContext } from '@/hooks/useKeyboardLayout'

// The app's nesting (see Providers.tsx): FeedbackPressProvider outside auto-paper's Provider (its
// Portal.Host and theme), and a ToastProvider for the update-error toast.
const mockSetLayout = jest.fn()
const Wrapper = ({ children }: { children: ReactNode }) => (
  <FeedbackPressProvider paper={RNPaper}>
    <Provider initialValue={{ appearance: 'light' }}>
      <ToastProvider>
        <KeyboardLayoutContext.Provider value={{ layout: 'qwerty', setLayout: mockSetLayout }}>{children}</KeyboardLayoutContext.Provider>
      </ToastProvider>
    </Provider>
  </FeedbackPressProvider>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Wrapper })

describe('SettingsDialog', () => {
  beforeEach(() => {
    mockSetLayout.mockClear()
  })

  it("shows the fleet sheet's shared rows plus Hangman's keyboard section and its version", async () => {
    const { getByText, getByLabelText } = await render(<SettingsDialog visible onDismiss={jest.fn()} />)

    expect(getByText('Settings')).toBeTruthy()
    expect(getByLabelText(/^Sound (on|off)$/)).toBeTruthy()
    expect(getByText('APPEARANCE')).toBeTruthy()
    expect(getByText('KEYBOARD')).toBeTruthy()
    expect(getByText('QWERTY')).toBeTruthy()
    expect(getByText(`VERSION ${release.otaVersion}`)).toBeTruthy()
  })

  // Hangman is portrait-locked by the OS, has no edge-swipe controls and no how-to-play guide yet,
  // so none of those rows apply.
  it('leaves out Lock Orientation, Edge Guard and How to Play', async () => {
    const { queryByText } = await render(<SettingsDialog visible onDismiss={jest.fn()} />)

    expect(queryByText('Lock Orientation')).toBeNull()
    expect(queryByText('Edge Guard')).toBeNull()
    expect(queryByText('How to Play')).toBeNull()
  })

  it('switches the keyboard layout when ABC is picked', async () => {
    const { getByText } = await render(<SettingsDialog visible onDismiss={jest.fn()} />)

    await fireEvent.press(getByText('ABC'))

    expect(mockSetLayout).toHaveBeenCalledWith('abc')
  })

  it('renders nothing while closed', async () => {
    const { queryByText } = await render(<SettingsDialog visible={false} onDismiss={jest.fn()} />)

    expect(queryByText('Settings')).toBeNull()
    expect(queryByText('KEYBOARD')).toBeNull()
  })
})
