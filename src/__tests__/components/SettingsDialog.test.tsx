import { Provider } from '@rific/auto-paper'
import { FeedbackPressProvider } from '@rific/feedback-press'
import { ToastProvider } from '@rific/toaster'
import { fireEvent, render as rtlRender, waitFor } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import * as RNPaper from 'react-native-paper'

import { SettingsDialog } from '@/components/SettingsDialog'
import { release } from '@/constants/release'
import { KeyboardLayoutContext } from '@/hooks/useKeyboardLayout'
import { alert } from '@/utils/alert'
import { pickHangmanFile, shareProgressBackupFile } from '@/utils/hangmanFile'
import { mergePuzzleUnlocks } from '@/utils/unlocks'

// The backup's only ways out to the device: the share sheet / file picker (hangmanFile.ts, not
// meaningfully unit-testable here), the alert, and AsyncStorage through mergePuzzleUnlocks.
// parseProgressBackup stays real, since its shape check is what the invalid-backup tests exercise.
jest.mock('@/utils/hangmanFile', () => ({
  pickHangmanFile: jest.fn(),
  shareProgressBackupFile: jest.fn()
}))
jest.mock('@/utils/alert', () => ({
  alert: jest.fn().mockResolvedValue(undefined)
}))
jest.mock('@/utils/unlocks', () => ({
  ...jest.requireActual('@/utils/unlocks'),
  mergePuzzleUnlocks: jest.fn()
}))
const mockPickHangmanFile = jest.mocked(pickHangmanFile)
const mockShareProgressBackupFile = jest.mocked(shareProgressBackupFile)
const mockAlert = jest.mocked(alert)
const mockMergePuzzleUnlocks = jest.mocked(mergePuzzleUnlocks)

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
    mockPickHangmanFile.mockReset()
    mockShareProgressBackupFile.mockReset()
    mockAlert.mockClear()
    mockMergePuzzleUnlocks.mockReset()
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

  describe('Backup', () => {
    it('has a BACKUP section with Export and Import, saying what the file holds', async () => {
      const { getByText } = await render(<SettingsDialog visible onDismiss={jest.fn()} />)

      expect(getByText('BACKUP')).toBeTruthy()
      expect(getByText('Export')).toBeTruthy()
      expect(getByText('Import')).toBeTruthy()
      expect(getByText(/unlocked puzzles/)).toBeTruthy()
    })

    it('shares a progress backup file from Export', async () => {
      mockShareProgressBackupFile.mockResolvedValue(true)
      const { getByText } = await render(<SettingsDialog visible onDismiss={jest.fn()} />)

      await fireEvent.press(getByText('Export'))

      await waitFor(() => expect(mockShareProgressBackupFile).toHaveBeenCalledTimes(1))
      expect(mockAlert).not.toHaveBeenCalled()
    })

    it("says so when sharing isn't available, or fails", async () => {
      mockShareProgressBackupFile.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('share failed'))
      const { getByText } = await render(<SettingsDialog visible onDismiss={jest.fn()} />)

      await fireEvent.press(getByText('Export'))
      await waitFor(() => expect(mockAlert).toHaveBeenCalledWith("Couldn't Share", 'Sharing is not available on this device.'))
      await fireEvent.press(getByText('Export'))
      await waitFor(() => expect(mockAlert).toHaveBeenCalledWith("Couldn't Share", expect.stringContaining('Something went wrong')))
    })

    it('does nothing when the file picker is canceled', async () => {
      mockPickHangmanFile.mockResolvedValue(null)
      const onUnlocksChanged = jest.fn()
      const { getByText } = await render(<SettingsDialog visible onDismiss={jest.fn()} onUnlocksChanged={onUnlocksChanged} />)

      await fireEvent.press(getByText('Import'))

      await waitFor(() => expect(mockPickHangmanFile).toHaveBeenCalled())
      expect(mockMergePuzzleUnlocks).not.toHaveBeenCalled()
      expect(onUnlocksChanged).not.toHaveBeenCalled()
    })

    it('merges a picked backup, tells its screen, and reports the counts', async () => {
      const payload = JSON.stringify({ unlocks: { animals: ['lion'] } })
      mockPickHangmanFile.mockResolvedValue(payload)
      mockMergePuzzleUnlocks.mockResolvedValue({ importedCount: 3, addedCount: 2 })
      const onUnlocksChanged = jest.fn()
      const { getByText } = await render(<SettingsDialog visible onDismiss={jest.fn()} onUnlocksChanged={onUnlocksChanged} />)

      await fireEvent.press(getByText('Import'))

      await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Import Complete', 'Merged 3 entries. Added 2 new unlocks.'))
      expect(mockMergePuzzleUnlocks).toHaveBeenCalledWith(payload)
      expect(onUnlocksChanged).toHaveBeenCalledTimes(1)
    })

    // parseProgressBackup (the real one) is what catches both: a custom pack export has a `pack` key,
    // not `unlocks`, so it's rejected before mergePuzzleUnlocks ever runs rather than merging nothing.
    it.each([
      ['not JSON', 'not valid json'],
      ['a custom pack, not a backup', JSON.stringify({ pack: { key: 'custom:abc', label: 'My Pack', puzzles: [] } })]
    ])('rejects a picked file that is %s, without merging', async (_kind, raw) => {
      mockPickHangmanFile.mockResolvedValue(raw)
      const onUnlocksChanged = jest.fn()
      const { getByText } = await render(<SettingsDialog visible onDismiss={jest.fn()} onUnlocksChanged={onUnlocksChanged} />)

      await fireEvent.press(getByText('Import'))

      await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Invalid Backup', expect.any(String)))
      expect(mockMergePuzzleUnlocks).not.toHaveBeenCalled()
      expect(onUnlocksChanged).not.toHaveBeenCalled()
    })
  })
})
