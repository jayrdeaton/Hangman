import { useHapticSettings } from '@rific/feedback-press'
import { renderHook } from '@testing-library/react-native'
import * as haptics from 'expo-haptics'

import { useGameHaptics } from '@/hooks/useGameHaptics'

jest.mock('@rific/feedback-press', () => ({ ...jest.requireActual('@rific/feedback-press'), useHapticSettings: jest.fn() }))

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' }
}))

const mockUseHapticSettings = jest.mocked(useHapticSettings)
const mockImpactAsync = jest.mocked(haptics.impactAsync)
const mockNotificationAsync = jest.mocked(haptics.notificationAsync)

describe('useGameHaptics', () => {
  beforeEach(() => {
    mockImpactAsync.mockClear()
    mockNotificationAsync.mockClear()
  })

  it('keeps each game event on its own haptic style while Vibrate is on', async () => {
    mockUseHapticSettings.mockReturnValue({ settings: { vibrate: true }, set: jest.fn() })
    const { result } = await renderHook(() => useGameHaptics())

    result.current.wrongGuess()
    expect(mockNotificationAsync).toHaveBeenLastCalledWith(haptics.NotificationFeedbackType.Error)

    result.current.correctGuess()
    expect(mockImpactAsync).toHaveBeenLastCalledWith()

    result.current.win()
    expect(mockNotificationAsync).toHaveBeenLastCalledWith(haptics.NotificationFeedbackType.Success)

    result.current.burst()
    expect(mockImpactAsync).toHaveBeenLastCalledWith(haptics.ImpactFeedbackStyle.Light)
  })

  it('fires nothing at all while Vibrate is off', async () => {
    mockUseHapticSettings.mockReturnValue({ settings: { vibrate: false }, set: jest.fn() })
    const { result } = await renderHook(() => useGameHaptics())

    result.current.wrongGuess()
    result.current.correctGuess()
    result.current.win()
    result.current.burst()

    expect(mockNotificationAsync).not.toHaveBeenCalled()
    expect(mockImpactAsync).not.toHaveBeenCalled()
  })
})
