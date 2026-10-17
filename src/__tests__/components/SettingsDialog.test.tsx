import { type AutoPaperTheme, Provider, useAutoPaperTheme } from '@rific/auto-paper'
import { FeedbackPressProvider } from '@rific/feedback-press'
import { ToastProvider } from '@rific/toaster'
import { act, fireEvent, render as rtlRender, waitFor } from '@testing-library/react-native'
import { type ReactElement, type ReactNode, useEffect } from 'react'
import { StyleSheet } from 'react-native'
import * as RNPaper from 'react-native-paper'
import { Provider as ReduxProvider } from 'react-redux'

import { PuzzleDefaultsProvider } from '@/components/PuzzleDefaultsProvider'
import { SettingsDialog } from '@/components/SettingsDialog'
import { release } from '@/constants/release'
import { KeyboardLayoutContext } from '@/hooks/useKeyboardLayout'
import { candleMode, classicMode, DEFAULT_MODE, robotMode, VISIBLE_MODES } from '@/modes/registry'
import { fullyDrawnMistakes } from '@/modes/shared/fullyDrawnMistakes'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { playerSettingsActions } from '@/redux/playerSettingsSlice'
import { roundActions, selectSoloRound } from '@/redux/roundSlice'
import { store } from '@/redux/store'
import { alert } from '@/utils/alert'
import { pickHangmanFile, shareProgressBackupFile } from '@/utils/hangmanFile'
import { GUEST_PLAYER_KEY } from '@/utils/players'
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
// A stand-in for each art thumbnail: what the grid asks it to draw, and a count of every render, so a
// test can tell a static thumbnail from one that keeps redrawing.
const mockArtRenders: string[] = []
jest.mock('@/components/GameVisual', () => {
  const { createElement } = jest.requireActual('react')
  const { View } = jest.requireActual('react-native')
  return {
    GameVisual: ({ mode, mistakes, color, colors }: { mode: { id: string }; mistakes: number; color: string; colors?: string[] }) => {
      mockArtRenders.push(mode.id)
      return createElement(View, { testID: `art-${mode.id}`, mistakes, color, colors })
    }
  }
})
const mockPickHangmanFile = jest.mocked(pickHangmanFile)
const mockShareProgressBackupFile = jest.mocked(shareProgressBackupFile)
const mockAlert = jest.mocked(alert)
const mockMergePuzzleUnlocks = jest.mocked(mergePuzzleUnlocks)

// The theme the sheet renders with, for the art's colors.
let capturedTheme: AutoPaperTheme | null = null
const ThemeCapture = () => {
  const theme = useAutoPaperTheme()
  useEffect(() => {
    capturedTheme = theme
  }, [theme])
  return null
}

// The app's nesting (see Providers.tsx): the store (the backup and the art are the active player's),
// FeedbackPressProvider outside auto-paper's Provider (its Portal.Host and theme), a ToastProvider for
// the update-error toast, and the player's puzzle defaults for the art.
const mockSetLayout = jest.fn()
const Wrapper = ({ children }: { children: ReactNode }) => (
  <ReduxProvider store={store}>
    <FeedbackPressProvider paper={RNPaper}>
      <Provider initialValue={{ appearance: 'light' }}>
        <ToastProvider>
          <KeyboardLayoutContext.Provider value={{ layout: 'qwerty', setLayout: mockSetLayout }}>
            <PuzzleDefaultsProvider>
              <ThemeCapture />
              {children}
            </PuzzleDefaultsProvider>
          </KeyboardLayoutContext.Provider>
        </ToastProvider>
      </Provider>
    </FeedbackPressProvider>
  </ReduxProvider>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Wrapper })
type Screen = Awaited<ReturnType<typeof render>>

const thumbnail = (screen: Screen, label: string) => screen.getByRole('button', { name: `${label} art` })
const borderColor = (screen: Screen, label: string) => StyleSheet.flatten(thumbnail(screen, label).props.style).borderColor
const playerArt = (playerKey = GUEST_PLAYER_KEY) => store.getState().playerSettings[playerKey]?.modeId
const soloRound = (playerKey = GUEST_PLAYER_KEY) => selectSoloRound(store.getState().round, playerKey)
// A solo round waiting on the board, on the Classic art, with a guess on it.
const seedSoloRound = (playerKey = GUEST_PLAYER_KEY) => {
  store.dispatch(roundActions.startSolo({ playerKey, puzzle: { phrase: 'DOG', modeId: DEFAULT_MODE.id, sourceMode: 'random' } }))
  store.dispatch(roundActions.saveSoloProgress({ playerKey, guessedLetters: ['D', 'Q'], hintRevealed: false }))
}

describe('SettingsDialog', () => {
  beforeEach(() => {
    store.dispatch(activePlayerActions.setActivePlayer(null))
    store.dispatch(playerSettingsActions.reset())
    store.dispatch(roundActions.reset())
    mockArtRenders.length = 0
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

  describe('Art', () => {
    it("offers every visible art as a thumbnail, with the player's art selected and named under the grid", async () => {
      const screen = await render(<SettingsDialog visible onDismiss={jest.fn()} />)

      expect(screen.getByText('ART')).toBeTruthy()
      for (const mode of VISIBLE_MODES) expect(thumbnail(screen, mode.label)).toBeTruthy()
      // Only the picker's arts: a hidden one (reachable through a shared link) isn't offered.
      expect(screen.getAllByRole('button', { name: / art$/ })).toHaveLength(VISIBLE_MODES.length)
      expect(screen.getByRole('button', { name: `${DEFAULT_MODE.label} art`, selected: true })).toBeTruthy()
      expect(screen.getAllByRole('button', { name: / art$/, selected: true })).toHaveLength(1)
      expect(screen.getByText(DEFAULT_MODE.description)).toBeTruthy()
    })

    it("frames the selected art in the theme's primary, and the rest in its outline variant", async () => {
      const screen = await render(<SettingsDialog visible onDismiss={jest.fn()} />)
      const { colors } = capturedTheme!

      expect(borderColor(screen, DEFAULT_MODE.label)).toBe(colors.primary)
      expect(borderColor(screen, robotMode.label)).toBe(colors.outlineVariant)
    })

    // A single representative frame per art, the same as the board's art at its fullest, in the
    // player's palette (the triad PuzzleStage gives the board).
    it("draws every thumbnail complete, in the player's colors", async () => {
      const screen = await render(<SettingsDialog visible onDismiss={jest.fn()} />)
      const { colors } = capturedTheme!

      for (const mode of VISIBLE_MODES) {
        const art = screen.getByTestId(`art-${mode.id}`)
        expect(art.props.mistakes).toBe(fullyDrawnMistakes(mode))
        expect(art.props.colors).toEqual([colors.primary, colors.secondary, colors.tertiary])
      }
    })

    it("shows the player's saved art as the selected one", async () => {
      store.dispatch(playerSettingsActions.setMode({ playerKey: GUEST_PLAYER_KEY, modeId: robotMode.id }))
      const screen = await render(<SettingsDialog visible onDismiss={jest.fn()} />)

      expect(screen.getByRole('button', { name: `${robotMode.label} art`, selected: true })).toBeTruthy()
      expect(screen.getByText(robotMode.description)).toBeTruthy()
    })

    it("picks an art on a tap: the player's, selected and named, with nothing else to confirm", async () => {
      const screen = await render(<SettingsDialog visible onDismiss={jest.fn()} />)

      await fireEvent.press(thumbnail(screen, candleMode.label))

      expect(playerArt()).toBe(candleMode.id)
      expect(screen.getByRole('button', { name: `${candleMode.label} art`, selected: true })).toBeTruthy()
      expect(screen.getByRole('button', { name: `${classicMode.label} art`, selected: false })).toBeTruthy()
      expect(screen.getByText(candleMode.description)).toBeTruthy()
      expect(screen.queryByText(classicMode.description)).toBeNull()
    })

    // The art is cosmetic, so a pick redraws the round already waiting, guesses and all.
    it("redraws the player's waiting round in the new art, keeping its guesses", async () => {
      seedSoloRound()
      const screen = await render(<SettingsDialog visible onDismiss={jest.fn()} />)

      await fireEvent.press(thumbnail(screen, robotMode.label))

      expect(soloRound().puzzle?.modeId).toBe(robotMode.id)
      expect(soloRound().guessedLetters).toEqual(['D', 'Q'])
    })

    it("picks for whoever is playing, leaving every other player's art and round alone", async () => {
      seedSoloRound()
      seedSoloRound('profile-a')
      store.dispatch(activePlayerActions.setActivePlayer('profile-a'))
      const screen = await render(<SettingsDialog visible onDismiss={jest.fn()} />)

      await fireEvent.press(thumbnail(screen, robotMode.label))

      expect(playerArt('profile-a')).toBe(robotMode.id)
      expect(soloRound('profile-a').puzzle?.modeId).toBe(robotMode.id)
      expect(playerArt()).toBeUndefined()
      expect(soloRound().puzzle?.modeId).toBe(DEFAULT_MODE.id)
    })

    // Static thumbnails: nothing here runs on a timer, so the art never redraws by itself.
    it('never redraws the thumbnails while the sheet sits open', async () => {
      jest.useFakeTimers()
      try {
        await render(<SettingsDialog visible onDismiss={jest.fn()} />)
        await act(async () => {
          jest.advanceTimersByTime(1000)
        })
        const rendersOnceOpen = mockArtRenders.length

        await act(async () => {
          jest.advanceTimersByTime(20000)
        })

        expect(mockArtRenders.length).toBe(rendersOnceOpen)
      } finally {
        jest.useRealTimers()
      }
    })

    // auto-paper's Dialog unmounts its rows after the close fade, so the grid isn't left mounted.
    it('takes the thumbnails down once the sheet has closed', async () => {
      const screen = await render(<SettingsDialog visible onDismiss={jest.fn()} />)
      expect(thumbnail(screen, DEFAULT_MODE.label)).toBeTruthy()

      await screen.rerender(<SettingsDialog visible={false} onDismiss={jest.fn()} />)

      await waitFor(() => expect(screen.queryByTestId(`art-${DEFAULT_MODE.id}`)).toBeNull())
    })
  })

  describe('Backup', () => {
    it('has a BACKUP section with Export and Import, saying what the file holds', async () => {
      const { getByText } = await render(<SettingsDialog visible onDismiss={jest.fn()} />)

      expect(getByText('BACKUP')).toBeTruthy()
      expect(getByText('Export')).toBeTruthy()
      expect(getByText('Import')).toBeTruthy()
      expect(getByText(/unlocked puzzles/)).toBeTruthy()
    })

    it("shares the active player's progress backup file from Export", async () => {
      mockShareProgressBackupFile.mockResolvedValue(true)
      const { getByText } = await render(<SettingsDialog visible onDismiss={jest.fn()} />)

      await fireEvent.press(getByText('Export'))

      await waitFor(() => expect(mockShareProgressBackupFile).toHaveBeenCalledTimes(1))
      expect(mockShareProgressBackupFile).toHaveBeenCalledWith(GUEST_PLAYER_KEY)
      expect(mockAlert).not.toHaveBeenCalled()
    })

    it("exports and imports a profile's own unlocked puzzles while they're the active player", async () => {
      store.dispatch(activePlayerActions.setActivePlayer('profile-a'))
      const payload = JSON.stringify({ unlocks: { animals: ['lion'] } })
      mockShareProgressBackupFile.mockResolvedValue(true)
      mockPickHangmanFile.mockResolvedValue(payload)
      mockMergePuzzleUnlocks.mockResolvedValue({ importedCount: 1, addedCount: 1 })
      const { getByText } = await render(<SettingsDialog visible onDismiss={jest.fn()} />)

      await fireEvent.press(getByText('Export'))
      await fireEvent.press(getByText('Import'))

      await waitFor(() => expect(mockMergePuzzleUnlocks).toHaveBeenCalledWith('profile-a', payload))
      expect(mockShareProgressBackupFile).toHaveBeenCalledWith('profile-a')
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
      expect(mockMergePuzzleUnlocks).toHaveBeenCalledWith(GUEST_PLAYER_KEY, payload)
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
